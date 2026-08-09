import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import {
  Channel,
  FulfillmentType,
  OrderStatus,
  PaymentMethod,
  UberMenuPublishStatus,
  type Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import { AppLogger } from '../../common/app-logger';
import { OrderEventsBus } from '../../messaging/order-events.bus';
import {
  NormalizedOrderItem,
  OrderIngestionService,
} from '../../orders/order-ingestion.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UberWebhookEnvelopeDto } from './dto/uber-webhook-envelope.dto';
import { UberAuthService } from './uber-auth.service';
import { UberConfigService } from './uber-config.service';
import { UberHttpClient, UberHttpResult } from './uber-http.client';
import {
  normalizeUberEventType,
  normalizeUberStoreId,
  redactUberLogText,
  summarizeUberDebugResponse,
  UberWebhookNonRetryableError,
} from './uber-integration.utils';
import type { UberAuthenticationError } from './uber-menu.types';
import type {
  ParsedUberModifier,
  ParsedUberOrder,
  ParsedUberOrderItem,
  UberDenyReasonCode,
  UberOrderActionName,
  UberOrderActionRecord,
  UberOrderActionResult,
  UberOrderDetailDto,
  UberOrderItemDto,
  UberOrderModifierDto,
} from './uber-order.types';
import { UBER_ACTION_BY_LOCAL_STATUS } from './uber-order.types';
import type {
  UberMerchantConnectionDelegate,
  UberOAuthStateRequestDelegate,
  UberOrderActionDelegate,
  UberStoreMappingDelegate,
} from './uber-prisma.types';

@Injectable()
export class UberOrderService {
  private static readonly UBER_MODIFIER_COMBINATION_LIMIT = 100;
  private readonly logger = new AppLogger(UberOrderService.name);
  private readonly uberApiBaseUrl: string;
  private readonly uberResourceHrefAllowedOrigins: string;
  private readonly oauthStateSecret: string;
  private readonly webhookSigningKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly uberAuthService: UberAuthService,
    private readonly orderEventsBus: OrderEventsBus,
    private readonly orderIngestionService: OrderIngestionService,
    private readonly httpClient: UberHttpClient,
    private readonly config: UberConfigService,
  ) {
    this.uberApiBaseUrl = config.apiBaseUrl;
    this.uberResourceHrefAllowedOrigins = config.resourceHrefAllowedOrigins;
    const secret = config.oauthStateSecret;
    if (secret.length < 32 || new Set(secret).size < 12) {
      throw new Error(
        'UBER_EATS_OAUTH_STATE_SECRET 必须配置为至少 32 个字符的高熵密钥',
      );
    }
    this.oauthStateSecret = secret;

    const webhookSigningKey = config.webhookSigningKey;
    if (!webhookSigningKey) {
      throw new Error('UBER_EATS_WEBHOOK_SIGNING_KEY 未配置');
    }
    this.webhookSigningKey = webhookSigningKey;
  }

  private get uberMerchantConnectionDelegate(): UberMerchantConnectionDelegate | null {
    const prismaWithUber = this.prisma as PrismaService & {
      uberMerchantConnection?: UberMerchantConnectionDelegate;
    };

    return prismaWithUber.uberMerchantConnection ?? null;
  }

  private get uberOAuthStateRequestDelegate(): UberOAuthStateRequestDelegate {
    const delegate = (
      this.prisma as PrismaService & {
        uberOAuthStateRequest?: UberOAuthStateRequestDelegate;
      }
    ).uberOAuthStateRequest;
    if (!delegate) {
      throw new Error('UberOAuthStateRequest 数据表不可用');
    }
    return delegate;
  }

  private get uberStoreMappingDelegate(): UberStoreMappingDelegate | null {
    const prismaWithUber = this.prisma as PrismaService & {
      uberStoreMapping?: UberStoreMappingDelegate;
    };

    return prismaWithUber.uberStoreMapping ?? null;
  }

  private get uberOrderActionDelegate(): UberOrderActionDelegate {
    const delegate = (
      this.prisma as PrismaService & {
        uberOrderAction?: UberOrderActionDelegate;
      }
    ).uberOrderAction;
    if (!delegate) {
      throw new Error('UberOrderAction 数据表不可用');
    }
    return delegate;
  }

  async syncOrderStatusToUber(externalOrderId: string, status: OrderStatus) {
    const clientRequestId = this.toClientRequestId(externalOrderId);
    const order = await this.prisma.order.findUnique({
      where: { clientRequestId },
      select: { id: true, orderStableId: true, status: true },
    });

    if (!order) {
      await this.captureEvent('ubereats_order_sync_failed', {
        externalOrderId,
        status,
        reason: 'order_not_found',
      });
      return {
        ok: false,
        externalOrderId,
        status,
        reason: 'ORDER_NOT_FOUND',
      };
    }

    const action = UBER_ACTION_BY_LOCAL_STATUS[status];
    if (!action) {
      throw new BadRequestException(
        `本地状态 ${status} 没有 Uber 文档支持的外部动作`,
      );
    }

    // Local transition and the action outbox row commit atomically. A worker may
    // call processPendingUberOrderActions after a crash; the eager call below is
    // only a latency optimisation.
    const updated = await this.prisma.$transaction(async (tx) => {
      const transition = await tx.order.updateMany({
        where: {
          id: order.id,
          status: { in: [OrderStatus.paid, OrderStatus.making] },
        },
        data: { status, readyAt: new Date() },
      });
      if (!transition.count) {
        // The status read before opening the transaction can be stale when two
        // POS devices click at once. Re-read under this transaction so an
        // already-ready order is an idempotent success, never a regression.
        const current = await tx.order.findUnique({
          where: { id: order.id },
          select: { status: true },
        });
        if (current?.status !== OrderStatus.ready) {
          throw new BadRequestException(
            'Uber 订单必须先接单，且状态不能并发回退',
          );
        }
      }
      await tx.uberOrderAction.upsert({
        where: { externalOrderId_action: { externalOrderId, action } },
        create: { externalOrderId, action, status: 'PENDING' },
        update: {},
      });
      return { orderStableId: order.orderStableId, status };
    });

    const result = await this.executeUberOrderAction(
      externalOrderId,
      action,
      {},
      true,
    );

    await this.captureEvent('ubereats_order_status_synced', {
      externalOrderId,
      orderStableId: updated.orderStableId,
      status,
      action,
      actionResult: result.ok ? 'SUCCEEDED' : 'FAILED',
    });

    return {
      ok: true,
      externalOrderId,
      orderStableId: updated.orderStableId,
      status: updated.status,
      action,
      localStatus: updated.status,
      uberSyncStatus: result.status,
      actionResult: result,
    };
  }

  async getReadyForPickupAction(externalOrderId: string) {
    return this.uberOrderActionDelegate.findUnique({
      where: {
        externalOrderId_action: {
          externalOrderId,
          action: 'READY_FOR_PICKUP',
        },
      },
    });
  }

  async retryReadyForPickup(externalOrderId: string) {
    const record = await this.getReadyForPickupAction(externalOrderId);
    if (!record) throw new BadRequestException('没有可重试的 Uber 就绪动作');
    if (record.status === 'FAILED' && !record.retryable) {
      return this.toUberOrderActionResult(record, true);
    }
    return this.executeUberOrderAction(
      externalOrderId,
      'READY_FOR_PICKUP',
      {},
      true,
    );
  }

  /** Queue workers can periodically drain retryable/PENDING outbox rows. */

  async processPendingUberOrderActions(limit = 50) {
    const rows = await this.uberOrderActionDelegate.findMany({
      where: {
        OR: [{ status: 'PENDING' }, { status: 'FAILED', retryable: true }],
      },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });
    return Promise.all(
      rows.map((row) => {
        const retryPayload =
          row.action === 'DENY'
            ? this.buildUberDenyOrderPayload(
                row.reasonCode ?? 'OTHER',
                row.reasonDetail ?? undefined,
              )
            : {};
        return this.executeUberOrderAction(
          row.externalOrderId,
          row.action,
          retryPayload,
          true,
        );
      }),
    );
  }

  /** Accept only an order whose complete local transaction has committed. */

  async acceptUberOrder(externalOrderId: string) {
    const normalizedOrderId = externalOrderId.trim();
    const localOrder = await this.prisma.order.findUnique({
      where: { clientRequestId: this.toClientRequestId(normalizedOrderId) },
      select: { id: true },
    });
    if (!localOrder) {
      throw new BadRequestException('订单尚未完整落库，禁止向 Uber 接单');
    }
    return this.executeUberOrderAction(normalizedOrderId, 'ACCEPT', {
      reason: 'accepted',
    });
  }

  /** Deny through Uber's POS decision endpoint with an auditable reason. */

  async denyUberOrder(
    externalOrderId: string,
    reasonCode: string,
    reasonDetail?: string,
  ) {
    const normalizedReason = reasonCode.trim();
    if (!normalizedReason) {
      throw new BadRequestException('拒单原因不能为空');
    }
    return this.executeUberOrderAction(
      externalOrderId.trim(),
      'DENY',
      this.buildUberDenyOrderPayload(normalizedReason, reasonDetail),
      false,
      {
        reasonCode: normalizedReason,
        reasonDetail: reasonDetail?.trim() || undefined,
      },
    );
  }

  private buildUberDenyOrderPayload(
    reasonCode: string,
    reasonDetail?: string,
  ): { reason: { code: UberDenyReasonCode; explanation: string } } {
    const normalizedReason = reasonCode.trim();
    const detail = reasonDetail?.trim();
    const uberReasonCode = this.toUberDenyReasonCode(normalizedReason);

    return {
      reason: {
        code: uberReasonCode,
        explanation: detail || normalizedReason || uberReasonCode,
      },
    };
  }

  private toUberDenyReasonCode(reasonCode: string): UberDenyReasonCode {
    switch (reasonCode.trim().toUpperCase()) {
      case 'STORE_CLOSED':
      case 'POS_NOT_READY':
      case 'POS_OFFLINE':
      case 'MISSING_ITEM':
      case 'MISSING_INFO':
      case 'PRICING':
      case 'CAPACITY':
      case 'ADDRESS':
      case 'SPECIAL_INSTRUCTIONS':
        return reasonCode.trim().toUpperCase() as UberDenyReasonCode;
      case 'ITEM_UNAVAILABLE':
      case 'ITEM_AVAILABILITY':
        return 'ITEM_AVAILABILITY';
      case 'INVALID_ORDER':
      default:
        return 'OTHER';
    }
  }

  async listPendingUberOrders() {
    const rows = await this.prisma.order.findMany({
      where: {
        channel: Channel.ubereats,
        status: {
          in: [OrderStatus.pending, OrderStatus.paid, OrderStatus.making],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        orderStableId: true,
        clientRequestId: true,
        status: true,
        totalCents: true,
        createdAt: true,
      },
    });

    return {
      count: rows.length,
      items: rows.map((row) => ({
        orderStableId: row.orderStableId,
        externalOrderId: row.clientRequestId?.replace('ubereats:', '') ?? null,
        status: row.status,
        totalCents: row.totalCents,
        createdAt: row.createdAt,
      })),
    };
  }

  async processWebhookEvent(
    eventType: string,
    eventId: string,
    envelope: UberWebhookEnvelopeDto | null,
  ) {
    if (!envelope) {
      throw new BadRequestException('Uber 订单 webhook envelope 无效');
    }

    const resourceUrl = this.validateOrderResourceHref(envelope.resourceHref);
    const token = await this.uberAuthService.getAccessToken(
      'eats.store.orders.read',
    );
    const orderPayload = await this.fetchUberOrderDetail(resourceUrl, token, {
      eventType,
      eventId,
      resourceId: envelope.resourceId,
    });

    const parsedOrder = this.parseOrderPayload(orderPayload);

    if (!parsedOrder) {
      const externalOrderId = envelope.resourceId;
      if (externalOrderId) {
        await this.autoDenyUberOrderForWebhook(
          externalOrderId,
          'INVALID_ORDER',
          '订单详情无法解析',
          { eventType, eventId },
        );
      }
      return;
    }

    const config = await this.ensureBusinessConfig();
    if (config.isTemporarilyClosed) {
      await this.autoDenyUberOrderForWebhook(
        parsedOrder.externalOrderId,
        'STORE_CLOSED',
        config.temporaryCloseReason ?? '门店暂停营业',
        { eventType, eventId },
      );
      return;
    }

    let order: {
      action: 'created' | 'updated';
      status: OrderStatus;
      orderId: string;
      orderStableId: string;
    };
    try {
      order = await this.upsertUberOrder(parsedOrder, eventType, eventId);
    } catch (error) {
      if (
        error instanceof BadRequestException &&
        error.message.includes('菜单映射')
      ) {
        await this.autoDenyUberOrderForWebhook(
          parsedOrder.externalOrderId,
          'ITEM_UNAVAILABLE',
          error.message,
          { eventType, eventId },
        );
        return;
      }
      // Database/local infrastructure errors deliberately remain pending so
      // the webhook/job can retry; accepting before commit would lose orders.
      throw error;
    }

    if (
      order.action === 'created' &&
      order.status === OrderStatus.paid &&
      normalizeUberEventType(eventType) === 'orders.notification'
    ) {
      this.orderEventsBus?.emitOrderPaidVerified({
        orderId: order.orderId,
        amountCents: Math.max(
          0,
          parsedOrder.subtotalCents - parsedOrder.discountCents,
        ),
        redeemValueCents: 0,
      });
    }

    await this.enqueueAndBestEffortAcceptUberOrder(
      parsedOrder.externalOrderId,
      {
        eventType,
        eventId,
        orderStableId: order.orderStableId,
      },
    );

    await this.captureEvent('ubereats_webhook_processed', {
      eventType,
      eventId,
      externalOrderId: parsedOrder.externalOrderId,
      orderStableId: order.orderStableId,
      storeId: parsedOrder.storeId ?? normalizeUberStoreId(undefined),
    });
  }

  private async autoDenyUberOrderForWebhook(
    externalOrderId: string,
    reasonCode: string,
    reasonDetail: string,
    context: { eventType: string; eventId: string },
  ) {
    try {
      await this.denyUberOrder(externalOrderId, reasonCode, reasonDetail);
    } catch (error) {
      const response =
        error instanceof BadGatewayException ? error.getResponse() : null;
      const responseObject = this.asObject(response);
      const status =
        typeof responseObject?.status === 'number'
          ? responseObject.status
          : undefined;
      const retryable = responseObject?.retryable === true;
      const detail = this.readString(responseObject?.detail);

      if (
        status !== undefined &&
        this.isNonRetryableOrderActionStatus(status) &&
        !retryable
      ) {
        const redactedDetail = detail ? redactUberLogText(detail) : undefined;
        this.logger.warn(
          `[ubereats webhook deny] non-retryable upstream failure swallowed externalOrderId=${externalOrderId} eventType=${context.eventType} eventId=${context.eventId} status=${status} retryable=false detail=${redactedDetail ?? 'unknown'}`,
        );
        await this.captureEvent('ubereats_webhook_auto_deny_failed', {
          externalOrderId,
          eventType: context.eventType,
          eventId: context.eventId,
          reasonCode,
          status,
          retryable: false,
          ...(redactedDetail ? { detail: redactedDetail } : {}),
        });
        return;
      }

      throw error;
    }
  }

  private isNonRetryableOrderActionStatus(status: number): boolean {
    return [400, 401, 403, 404].includes(status);
  }

  private async enqueueAndBestEffortAcceptUberOrder(
    externalOrderId: string,
    context: {
      eventType: string;
      eventId: string;
      orderStableId: string;
    },
  ) {
    await this.uberOrderActionDelegate.upsert({
      where: { externalOrderId_action: { externalOrderId, action: 'ACCEPT' } },
      create: {
        externalOrderId,
        action: 'ACCEPT',
        status: 'PENDING',
        reasonCode: 'accepted',
      },
      update: {},
    });

    try {
      await this.executeUberOrderAction(
        externalOrderId,
        'ACCEPT',
        { reason: 'accepted' },
        true,
      );
    } catch (error) {
      const response =
        error instanceof BadGatewayException ? error.getResponse() : null;
      const responseObject = this.asObject(response);
      const retryable = responseObject?.retryable === true;
      const status =
        typeof responseObject?.status === 'number'
          ? responseObject.status
          : error instanceof BadGatewayException
            ? error.getStatus()
            : undefined;
      const detail = this.readString(responseObject?.detail);
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `[ubereats webhook accept] best-effort accept failed externalOrderId=${externalOrderId} eventId=${context.eventId} retryable=${retryable} status=${status ?? 'unknown'} error=${redactUberLogText(detail || errorMessage)}`,
      );

      await this.captureEvent(
        retryable
          ? 'ubereats_order_accept_retry_queued'
          : 'ubereats_order_accept_manual_review_required',
        {
          externalOrderId,
          eventType: context.eventType,
          eventId: context.eventId,
          orderStableId: context.orderStableId,
          retryable,
          ...(status !== undefined ? { status } : {}),
          ...(detail ? { detail: redactUberLogText(detail) } : {}),
        },
      );
    }
  }

  private async fetchUberOrderDetail(
    resourceUrl: string,
    token: string,
    context: {
      eventType: string;
      eventId: string;
      resourceId?: string | null;
    },
  ): Promise<unknown> {
    let result = await this.requestUberOrderDetail(resourceUrl, token);
    let { response, text: rawText, data: parsed } = result;

    if (
      (response.status === 401 || response.status === 403) &&
      typeof this.uberAuthService.forceRefreshAccessToken === 'function'
    ) {
      const refreshedToken = await this.uberAuthService.forceRefreshAccessToken(
        'eats.store.orders.read',
      );
      result = await this.requestUberOrderDetail(resourceUrl, refreshedToken);
      ({ response, text: rawText, data: parsed } = result);
    }

    if (response.ok) {
      return parsed;
    }

    const authenticationError =
      response.status === 401 || response.status === 403
        ? this.buildUberAuthenticationError(parsed, response.status)
        : undefined;
    const detail = authenticationError
      ? JSON.stringify(authenticationError)
      : summarizeUberDebugResponse(parsed, rawText);
    const resource = new URL(resourceUrl);
    const uberRequestId =
      response.headers.get('x-uber-request-id') ??
      response.headers.get('x-request-id') ??
      response.headers.get('trace-id');

    this.logger.error(
      `[ubereats order] detail fetch failed status=${response.status} eventType=${context.eventType} eventId=${context.eventId} resourceId=${context.resourceId ?? 'unknown'} resourceUrl=${resource.origin}${resource.pathname} uberRequestId=${uberRequestId ?? 'unknown'} detail=${redactUberLogText(detail)}`,
    );

    const payload = {
      ok: false,
      status: response.status,
      message: 'Uber 订单详情接口返回错误',
      detail,
      ...(authenticationError ? { error: authenticationError } : {}),
    };

    if (this.isNonRetryableOrderDetailStatus(response.status)) {
      throw new UberWebhookNonRetryableError(
        JSON.stringify(payload),
        response.status,
        detail,
      );
    }

    throw new BadGatewayException(payload);
  }

  private async requestUberOrderDetail(
    resourceUrl: string,
    token: string,
  ): Promise<UberHttpResult> {
    try {
      return await this.httpClient.request({
        returnErrorResponse: true,
        url: resourceUrl,
        method: 'GET',
        redirect: 'error',
        accessToken: token,
        kind: 'orderDetail',
      });
    } catch (error) {
      throw new BadGatewayException({
        ok: false,
        message: '下载 Uber 订单详情失败',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private isNonRetryableOrderDetailStatus(status: number): boolean {
    return [400, 401, 403, 404].includes(status);
  }

  private async executeUberOrderAction(
    externalOrderId: string,
    action: UberOrderActionName,
    payload: Record<string, unknown>,
    processPending = false,
    audit?: { reasonCode?: string; reasonDetail?: string },
  ) {
    if (!externalOrderId) {
      throw new BadRequestException('externalOrderId 不能为空');
    }
    const delegate = this.uberOrderActionDelegate;
    const key = { externalOrderId, action };
    let record = await delegate.findUnique({
      where: { externalOrderId_action: key },
    });
    if (
      record?.status === 'SUCCEEDED' ||
      (record?.status === 'PENDING' && !processPending)
    ) {
      if (action === 'ACCEPT' && record.status === 'SUCCEEDED') {
        await this.advanceLocalUberOrderStatusAfterAccept(externalOrderId);
      }
      return this.toUberOrderActionResult(record, true);
    }
    if (record && !record.retryable && !processPending) {
      return this.toUberOrderActionResult(record, true);
    }
    if (!record) {
      try {
        record = await delegate.create({
          data: {
            ...key,
            status: 'PENDING',
            reasonCode: audit?.reasonCode ?? this.readString(payload.reason),
            reasonDetail:
              audit?.reasonDetail ?? this.readString(payload.details),
            attemptCount: 1,
          },
        });
      } catch (error) {
        if (this.readString(this.asObject(error)?.code) !== 'P2002')
          throw error;
        record = await delegate.findUnique({
          where: { externalOrderId_action: key },
        });
        if (!record) throw error;
        return this.toUberOrderActionResult(record, true);
      }
    } else {
      record = await delegate.update({
        where: { id: record.id },
        data: {
          status: 'PENDING',
          retryable: false,
          attemptCount: { increment: 1 },
        },
      });
    }

    const encodedOrderId = encodeURIComponent(externalOrderId);
    const pathnameByAction: Record<UberOrderActionName, string> = {
      ACCEPT: `/v1/eats/orders/${encodedOrderId}/accept_pos_order`,
      DENY: `/v1/eats/orders/${encodedOrderId}/deny_pos_order`,
      READY_FOR_PICKUP: `/v1/delivery/order/${encodedOrderId}/ready`,
    };
    const pathname = pathnameByAction[action];
    let response: Response;
    let rawText = '';
    let parsed: unknown = {};
    try {
      const token = await this.uberAuthService.getAccessToken('eats.order');
      ({
        response,
        text: rawText,
        data: parsed,
      } = await this.httpClient.request({
        returnErrorResponse: true,
        path: pathname,
        baseUrl: this.uberApiBaseUrl,
        method: 'POST',
        accessToken: token,
        json: payload,
        kind: 'api',
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorType = error instanceof Error ? error.name : typeof error;
      const redactedError = redactUberLogText(errorMessage);
      await delegate.update({
        where: { id: record.id },
        data: {
          status: 'FAILED',
          retryable: true,
          lastError: redactedError
            .replace(/(token|secret|authorization)=?[^\s&]*/gi, '$1=[REDACTED]')
            .slice(0, 2_000),
          response: this.redactUberResponse({
            error: errorMessage,
          }),
        },
      });
      this.logger.error(
        `[ubereats order action] request failed action=${action} externalOrderId=${externalOrderId} endpoint=${pathname} errorType=${errorType} error=${redactedError}`,
      );
      if (action !== 'READY_FOR_PICKUP') {
        throw new BadGatewayException({
          ok: false,
          externalOrderId,
          action,
          endpoint: pathname,
          retryable: true,
          message: 'Uber 订单动作网络请求失败或超时',
          detail: redactedError,
        });
      }
      return {
        ok: false,
        action,
        actionId: record.id,
        status: 'FAILED' as const,
        retryable: true,
        duplicate: false,
        errorSummary: 'Uber 订单动作网络请求失败或超时',
      };
    }

    // Uber may answer 409 when a retried ready action has already won upstream.
    const succeeded =
      response.ok || (action === 'READY_FOR_PICKUP' && response.status === 409);
    const retryable = response.status === 429 || response.status >= 500;
    const uberRequestId =
      response.headers.get('x-request-id') ??
      response.headers.get('uber-request-id');
    await delegate.update({
      where: { id: record.id },
      data: {
        status: succeeded ? 'SUCCEEDED' : 'FAILED',
        uberHttpStatus: response.status,
        retryable,
        uberRequestId,
        lastError: succeeded
          ? null
          : summarizeUberDebugResponse(parsed, rawText).slice(0, 2_000),
        response: this.redactUberResponse(
          parsed ?? { body: rawText.slice(0, 2_000) },
        ),
        ...(succeeded ? { completedAt: new Date() } : {}),
      },
    });
    if (!succeeded) {
      this.logger.error(
        `[ubereats order action] upstream failed action=${action} externalOrderId=${externalOrderId} endpoint=${pathname} status=${response.status} retryable=${retryable} uberRequestId=${uberRequestId ?? 'unknown'} detail=${redactUberLogText(summarizeUberDebugResponse(parsed, rawText))}`,
      );
      if (action !== 'READY_FOR_PICKUP') {
        throw new BadGatewayException({
          ok: false,
          externalOrderId,
          action,
          endpoint: pathname,
          status: response.status,
          uberRequestId,
          retryable,
          detail: redactUberLogText(
            summarizeUberDebugResponse(parsed, rawText),
          ),
        });
      }
      return {
        ok: false,
        action,
        actionId: record.id,
        status: 'FAILED' as const,
        retryable,
        duplicate: false,
        uberHttpStatus: response.status,
        errorSummary: `Uber 返回 HTTP ${response.status}`,
      };
    }
    if (action === 'ACCEPT') {
      await this.advanceLocalUberOrderStatusAfterAccept(externalOrderId);
    }
    return {
      ok: true,
      duplicate: false,
      action,
      actionId: record.id,
      status: 'SUCCEEDED' as const,
      retryable: false,
      uberHttpStatus: response.status,
    };
  }

  private toUberOrderActionResult(
    record: UberOrderActionRecord,
    duplicate: boolean,
  ): UberOrderActionResult {
    const status = record.status as UberOrderActionResult['status'];
    return {
      ok: status === 'SUCCEEDED',
      action: record.action,
      actionId: record.id,
      status,
      retryable: record.retryable,
      duplicate,
      uberHttpStatus: record.uberHttpStatus,
      ...(record.lastError ? { errorSummary: 'Uber 同步失败' } : {}),
    };
  }

  private async advanceLocalUberOrderStatusAfterAccept(
    externalOrderId: string,
  ): Promise<void> {
    if (this.orderIngestionService) {
      await this.orderIngestionService.markAccepted(
        this.toClientRequestId(externalOrderId),
      );
      return;
    }
    const orderDelegate = this.prisma.order as unknown as {
      findUnique?: (args: {
        where: { clientRequestId: string };
        select: { id: true; orderStableId: true; status: true; paidAt: true };
      }) => Promise<{
        id: string;
        orderStableId: string | null;
        status: OrderStatus;
        paidAt: Date | null;
      } | null>;
      updateMany?: (args: {
        where: { id: string; status: { in: OrderStatus[] } };
        data: { status: OrderStatus; paidAt?: Date; makingAt?: Date };
      }) => Promise<{ count: number }>;
    };
    if (
      typeof orderDelegate.findUnique !== 'function' ||
      typeof orderDelegate.updateMany !== 'function'
    ) {
      return;
    }

    const clientRequestId = this.toClientRequestId(externalOrderId);
    const existing = await orderDelegate.findUnique({
      where: { clientRequestId },
      select: { id: true, orderStableId: true, status: true, paidAt: true },
    });

    if (
      !existing ||
      (existing.status !== OrderStatus.pending &&
        existing.status !== OrderStatus.paid)
    ) {
      return;
    }

    const advancedAt = new Date();
    const targetStatus = OrderStatus.making;
    const result = await orderDelegate.updateMany({
      where: {
        id: existing.id,
        status: { in: [OrderStatus.pending, OrderStatus.paid] },
      },
      data: {
        status: targetStatus,
        paidAt: existing.paidAt ?? advancedAt,
        makingAt: advancedAt,
      },
    });

    if (result.count === 0) {
      return;
    }

    if (existing.orderStableId) {
      this.orderEventsBus?.emitOrderAccepted({
        orderId: existing.id,
        stableId: existing.orderStableId,
      });
    }
  }

  private redactUberResponse(value: unknown): Prisma.InputJsonValue {
    if (Array.isArray(value)) {
      return value.map((item) => this.redactUberResponse(item));
    }
    const object = this.asObject(value);
    if (!object) {
      if (typeof value === 'string') {
        return value
          .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
          .replace(/\b(token|password|secret)=([^\s&]+)/gi, '$1=[REDACTED]')
          .slice(0, 2_000);
      }
      return (value === undefined ? null : value) as Prisma.InputJsonValue;
    }
    return Object.fromEntries(
      Object.entries(object).map(([key, item]) => [
        key,
        /token|authorization|phone|email|address|name/i.test(key)
          ? '[REDACTED]'
          : this.redactUberResponse(item),
      ]),
    );
  }

  private validateOrderResourceHref(resourceHref: string): string {
    return this.buildUberApiUrlFromResourceHref(resourceHref);
  }

  private buildUberApiUrlFromResourceHref(resourceHref: string): string {
    let resource: URL;
    let base: URL;
    try {
      resource = new URL(resourceHref);
      base = new URL(this.uberApiBaseUrl);
    } catch {
      throw new BadRequestException('Uber resource_href 无效');
    }

    const allowedOrigins = this.parseUberResourceHrefAllowedOrigins();
    if (
      !allowedOrigins.has(resource.origin) ||
      resource.username ||
      resource.password
    ) {
      this.logger.warn(
        'ubereats webhook resource_href rejected ' +
          `resourceOrigin=${resource.origin} ` +
          `resourcePathname=${resource.pathname} ` +
          `allowedOrigins=${[...allowedOrigins].join(',') || 'none'} ` +
          `uberApiOrigin=${base.origin}`,
      );
      throw new BadRequestException('Uber resource_href 不属于允许的来源');
    }

    const mappedUrl = new URL(base.origin);
    mappedUrl.pathname = resource.pathname;
    mappedUrl.search = resource.search;
    return mappedUrl.toString();
  }

  private parseUberResourceHrefAllowedOrigins(): Set<string> {
    const origins = this.uberResourceHrefAllowedOrigins
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
      .map((origin) => {
        try {
          return new URL(origin).origin;
        } catch {
          return null;
        }
      })
      .filter((origin): origin is string => Boolean(origin));

    return new Set(origins);
  }

  private async upsertUberOrder(
    order: ParsedUberOrder,
    eventType: string,
    eventId: string,
  ) {
    const clientRequestId = this.toClientRequestId(order.externalOrderId);
    const mappedStatus = this.mapEventTypeToOrderStatus(eventType);
    const amountValidation = this.validateOrderAmounts(order);
    const itemPriceComparisons: Array<{
      externalLineId: string | null;
      uberItemId: string | null;
      publishedPriceCents: number | null;
      uberBasePriceCents: number;
      priceVarianceCents: number | null;
      quantity: number;
    }> = [];

    const storeId = await this.resolvePosStoreId(order.storeId ?? '');
    const txLike = this.prisma as unknown as Prisma.TransactionClient;
    const normalizedItems: NormalizedOrderItem[] = [];
    for (const item of order.items) {
      const productStableId = await this.resolveUberProductStableId(
        txLike,
        order.storeId,
        item,
        order.paidAt,
      );
      const product = await txLike.menuItem.findFirst({
        where: { stableId: productStableId },
        select: { nameEn: true, nameZh: true },
      });
      const publishedPriceCents = await this.resolvePublishedPriceCents(
        txLike,
        order.storeId,
        item.externalItemId,
        order.paidAt,
      );
      const priceVarianceCents =
        publishedPriceCents === null
          ? null
          : item.baseUnitPriceCents - publishedPriceCents;
      itemPriceComparisons.push({
        externalLineId: item.externalLineId,
        uberItemId: item.externalItemId,
        publishedPriceCents,
        uberBasePriceCents: item.baseUnitPriceCents,
        priceVarianceCents,
        quantity: item.quantity,
      });
      normalizedItems.push({
        productStableId,
        quantity: item.quantity,
        displayName: item.displayName,
        nameEn: product?.nameEn?.trim() || null,
        nameZh: product?.nameZh?.trim() || null,
        baseUnitPriceCents: item.baseUnitPriceCents,
        optionsUnitPriceCents: item.optionsUnitPriceCents,
        unitPriceCents: item.unitPriceCents,
        options: await this.toOrderOptionsSnapshot(
          txLike,
          order.storeId,
          item.modifiers,
        ),
        external: {
          itemId: item.externalItemId,
          lineId: item.externalLineId,
          instructions: item.specialInstructions,
          lineTotalCents: item.lineTotalCents,
          publishedPriceCents,
          channelBasePriceCents: item.baseUnitPriceCents,
          priceVarianceCents,
          modifiers: this.flattenUberModifiers(item.modifiers).map(
            (modifier) => ({
              externalId: modifier.externalId,
              parentExternalId: modifier.parentExternalId,
              displayName: modifier.displayName,
              quantity: modifier.quantity,
              priceDeltaCents: modifier.priceDeltaCents,
              specialInstructions: modifier.specialInstructions,
              snapshot: modifier as unknown as Prisma.InputJsonValue,
            }),
          ),
        },
      });
    }

    const result = await this.orderIngestionService.ingest(
      {
        channel: Channel.ubereats,
        paymentMethod: PaymentMethod.UBEREATS,
        externalOrderId: order.externalOrderId,
        clientRequestId,
        storeId,
        status: mappedStatus ?? OrderStatus.pending,
        paidAt: order.paidAt,
        fulfillmentType:
          order.fulfillmentType === 'delivery'
            ? FulfillmentType.delivery
            : FulfillmentType.pickup,
        pickupCode: order.pickupCode,
        amounts: {
          subtotalCents: order.subtotalCents,
          subtotalAfterDiscountCents: Math.max(
            0,
            order.subtotalCents - order.discountCents,
          ),
          couponDiscountCents: order.discountCents,
          taxCents: order.taxCents,
          deliveryFeeCents: order.deliveryFeeCents,
          totalCents: order.totalCents,
          paymentTotalCents: order.totalCents,
        },
        contact: { name: order.contactName, phone: order.contactPhone },
        externalSnapshot: {
          displayId: order.displayId,
          notes: order.specialInstructions,
          estimatedReadyAt: order.estimatedReadyAt,
          priceVarianceCents: amountValidation.totalVarianceCents,
        },
        items: normalizedItems,
      },
      {
        verifyWebPayment: false,
        applyMembershipPoints: false,
        applyCoupons: false,
        persistExternalSnapshot: true,
        emitPaidLifecycleEvent: false,
      },
      async (tx, saved) => {
        const normalizedEvent = normalizeUberEventType(eventType);
        if (
          normalizedEvent === 'orders.cancelled' ||
          normalizedEvent === 'orders.cancel' ||
          normalizedEvent === 'orders.rejected'
        ) {
          const cancellation = order.cancellation ?? {
            cancelledBy: null,
            reasonCode: null,
            reasonDetail: null,
            occurredAt: new Date(),
          };
          await tx.uberOrderCancellation.upsert({
            where: { eventId },
            create: {
              orderId: saved.orderId,
              externalOrderId: order.externalOrderId,
              eventId,
              kind: normalizedEvent.endsWith('rejected')
                ? 'REJECTED'
                : 'CANCELLED',
              ...cancellation,
            },
            update: {},
          });

          // Uber cancellation callbacks are the settlement confirmation for
          // this integration: Uber will not settle the cancelled order. Keep
          // the audit record, financial amendment and terminal order status in
          // the same transaction. A deterministic amendmentStableId makes a
          // replay harmless even if the inbox claim is retried after a crash.
          const refundCents = Math.max(0, order.totalCents);
          await tx.orderAmendment.upsert({
            where: {
              amendmentStableId: this.uberCancellationAmendmentId(eventId),
            },
            create: {
              amendmentStableId: this.uberCancellationAmendmentId(eventId),
              orderId: saved.orderId,
              type: 'RETENDER',
              paymentMethod: PaymentMethod.UBEREATS,
              reason:
                cancellation.reasonDetail ??
                cancellation.reasonCode ??
                'Uber cancellation confirmed',
              deltaCents: -refundCents,
              refundCents,
              summaryJson: {
                kind: 'UBER_CANCELLATION',
                status: 'CONFIRMED',
                eventId,
                externalOrderId: order.externalOrderId,
              },
            },
            update: {},
          });
          await tx.order.update({
            where: { id: saved.orderId },
            data: { status: OrderStatus.refunded },
          });
        }
        await tx.uberWebhookInbox.upsert({
          where: { eventId },
          create: {
            eventId,
            eventType,
            externalOrderId: order.externalOrderId,
            status: 'PROCESSED',
            attemptCount: 1,
            processedAt: new Date(),
            payload: amountValidation as unknown as Prisma.InputJsonValue,
          },
          update: {
            status: 'PROCESSED',
            processedAt: new Date(),
            errorSummary: null,
            nextRetryAt: null,
          },
        });
      },
    );

    const menuPriceVarianceCents = itemPriceComparisons.reduce(
      (sum, item) => sum + (item.priceVarianceCents ?? 0) * item.quantity,
      0,
    );
    const hasMenuPriceVariance = itemPriceComparisons.some(
      (item) =>
        item.priceVarianceCents !== null &&
        Math.abs(item.priceVarianceCents) > 1,
    );
    if (amountValidation.hasMaterialVariance || hasMenuPriceVariance) {
      this.logger.warn(
        `[ubereats order] amount variance externalOrderId=${order.externalOrderId} line=${amountValidation.lineVarianceCents} total=${amountValidation.totalVarianceCents} menu=${menuPriceVarianceCents}`,
      );
    }
    await this.captureEvent('ubereats_order_upserted', {
      eventType,
      externalOrderId: order.externalOrderId,
      orderStableId: result.orderStableId,
      mappedStatus: result.status,
      action: result.action,
      ...amountValidation,
      priceValidationPolicy: 'WARN_AND_ACCEPT',
      hasPromotion: order.hasPromotion,
      promotionDiscountCents: order.discountCents,
      menuPriceVarianceCents,
      hasMenuPriceVariance,
      itemPriceComparisons,
    });
    return result;
  }

  private uberCancellationAmendmentId(eventId: string): string {
    return `uber_cancel_${createHash('sha256').update(eventId).digest('hex')}`;
  }

  private async resolvePosStoreId(uberStoreId: string): Promise<string> {
    const delegate = (
      this.prisma as unknown as {
        uberStoreMapping?: {
          findUnique(
            args: unknown,
          ): Promise<{ posExternalStoreId: string | null } | null>;
        };
      }
    ).uberStoreMapping;
    if (!delegate) return uberStoreId;
    const mapping = await delegate.findUnique({
      where: { uberStoreId },
      select: { posExternalStoreId: true },
    });
    return mapping?.posExternalStoreId?.trim() || uberStoreId;
  }

  private async resolvePublishedPriceCents(
    tx: Prisma.TransactionClient,
    storeId: string | null | undefined,
    uberItemId: string | null,
    orderedAt: Date,
  ): Promise<number | null> {
    if (!storeId || !uberItemId) return null;
    const delegate = (
      tx as unknown as {
        uberPublishedMenuItem?: {
          findFirst: (args: unknown) => Promise<{
            publishedPriceCents: number;
          } | null>;
        };
      }
    ).uberPublishedMenuItem;
    if (!delegate) return null;
    const snapshot = await delegate.findFirst({
      where: {
        uberStoreId: storeId,
        uberItemId,
        publishedAt: { lte: orderedAt },
        publishVersion: {
          status: {
            in: [
              UberMenuPublishStatus.SUBMITTED,
              UberMenuPublishStatus.SUCCEEDED,
            ],
          },
        },
      },
      orderBy: { publishedAt: 'desc' },
      select: { publishedPriceCents: true },
    });
    return snapshot?.publishedPriceCents ?? null;
  }

  private async resolveUberProductStableId(
    tx: Prisma.TransactionClient,
    storeId: string | null | undefined,
    item: ParsedUberOrderItem,
    orderedAt: Date,
  ): Promise<string> {
    let stableId: string | null = null;
    if (item.externalItemId?.startsWith('sanq:')) {
      if (storeId) {
        const snapshot = await (
          tx as unknown as {
            uberPublishedMenuItem: {
              findFirst: (
                args: unknown,
              ) => Promise<{ menuItemStableId: string } | null>;
            };
          }
        ).uberPublishedMenuItem.findFirst({
          where: {
            uberStoreId: storeId,
            uberItemId: item.externalItemId,
            publishedAt: { lte: orderedAt },
            publishVersion: {
              status: {
                in: [
                  UberMenuPublishStatus.SUBMITTED,
                  UberMenuPublishStatus.SUCCEEDED,
                ],
              },
            },
          },
          orderBy: { publishedAt: 'desc' },
          select: { menuItemStableId: true },
        });
        if (snapshot) stableId = snapshot.menuItemStableId;
      }

      if (!stableId) {
        const localItems = await tx.menuItem.findMany({
          select: { stableId: true },
        });
        const deterministic = localItems.find(
          (candidate) =>
            this.buildStableUberNodeId(
              'item',
              storeId ?? 'default',
              candidate.stableId,
            ) === item.externalItemId,
        );
        if (deterministic) stableId = deterministic.stableId;
      }
    }

    const candidates = [item.stableIdHint, item.externalItemId].filter(
      (value): value is string => !!value,
    );
    if (!stableId && candidates.length) {
      const local = await tx.menuItem.findFirst({
        where: { stableId: { in: candidates } },
        select: { stableId: true },
      });
      if (local) stableId = local.stableId;
      const config =
        !stableId &&
        (await tx.uberItemChannelConfig.findFirst({
          where: {
            AND: [
              ...(storeId
                ? [{ OR: [{ storeId }, { uberStoreId: storeId }] }]
                : []),
              {
                OR: [
                  { externalItemId: { in: candidates } },
                  { menuItemStableId: { in: candidates } },
                ],
              },
            ],
          },
          select: { menuItemStableId: true },
        }));
      if (config) stableId = config.menuItemStableId;
    }
    if (!stableId) {
      // Historical/external items can outlive the menu/config that originally
      // published them. Keep the order consumable and let displayName remain
      // the immutable Uber snapshot used by every UI/print fallback.
      stableId =
        item.stableIdHint?.trim() ||
        item.externalItemId?.trim() ||
        `uber-unmapped-${createHash('sha256')
          .update(item.displayName)
          .digest('hex')
          .slice(0, 20)}`;
      this.logger?.warn(
        `[ubereats order] unmapped item retained externalItemId=${item.externalItemId ?? 'missing'}`,
      );
    }
    return stableId;
  }

  private flattenUberModifiers(
    items: ParsedUberModifier[],
  ): ParsedUberModifier[] {
    return items.flatMap((item) => [
      item,
      ...this.flattenUberModifiers(item.children),
    ]);
  }

  private async toOrderOptionsSnapshot(
    tx: Prisma.TransactionClient,
    storeId: string | null | undefined,
    items: ParsedUberModifier[],
  ): Promise<Prisma.InputJsonValue> {
    return Promise.all(
      items.map(async (item, index) => {
        const group = await this.resolveUberModifierGroup(
          tx,
          storeId,
          item.parentExternalId,
        );
        const choices = await Promise.all(
          this.flattenUberModifiers([item]).map(async (choice, choiceIndex) => {
            const mapped = await this.resolveUberModifierChoice(
              tx,
              storeId,
              choice.externalId,
            );
            return {
              stableId:
                mapped?.stableId ??
                choice.externalId ??
                `uber-option-${index}-${choiceIndex}`,
              templateGroupStableId:
                group?.stableId ??
                choice.parentExternalId ??
                `uber-group-${index}`,
              nameEn: mapped?.nameEn ?? null,
              nameZh: mapped?.nameZh ?? null,
              displayName: choice.displayName,
              priceDeltaCents: choice.priceDeltaCents,
              quantity: choice.quantity,
              specialInstructions: choice.specialInstructions,
              sortOrder: choiceIndex,
            };
          }),
        );
        return {
          templateGroupStableId:
            group?.stableId ?? item.parentExternalId ?? `uber-group-${index}`,
          nameEn: group?.nameEn ?? null,
          nameZh: group?.nameZh ?? null,
          displayName: group ? null : item.displayName,
          minSelect: 0,
          maxSelect: null,
          sortOrder: index,
          choices,
        };
      }),
    );
  }

  private async resolveUberModifierGroup(
    tx: Prisma.TransactionClient,
    storeId: string | null | undefined,
    externalId: string | null,
  ) {
    if (!externalId) return null;
    const templates = await tx.menuOptionGroupTemplate.findMany({
      select: { stableId: true, nameEn: true, nameZh: true },
    });
    let stableId = templates.find(
      (template) =>
        template.stableId === externalId ||
        this.buildStableUberNodeId(
          'group',
          storeId ?? 'default',
          template.stableId,
        ) === externalId,
    )?.stableId;
    if (!stableId) {
      const config = await tx.uberModifierGroupConfig.findFirst({
        where: {
          ...(storeId ? { OR: [{ storeId }, { uberStoreId: storeId }] } : {}),
          externalModifierGroupId: externalId,
        },
        select: { templateGroupStableId: true },
      });
      stableId = config?.templateGroupStableId;
    }
    const template = templates.find(
      (candidate) => candidate.stableId === stableId,
    );
    return template
      ? {
          stableId: template.stableId,
          nameEn: template.nameEn,
          nameZh: template.nameZh,
        }
      : null;
  }

  private async resolveUberModifierChoice(
    tx: Prisma.TransactionClient,
    storeId: string | null | undefined,
    externalId: string | null,
  ) {
    if (!externalId) return null;
    const choices = await tx.menuOptionTemplateChoice.findMany({
      select: { stableId: true, nameEn: true, nameZh: true },
    });
    let stableId = choices.find(
      (choice) =>
        choice.stableId === externalId ||
        this.buildStableUberNodeId(
          'item',
          storeId ?? 'default',
          choice.stableId,
        ) === externalId,
    )?.stableId;
    if (!stableId) {
      const config = await tx.uberOptionItemConfig.findFirst({
        where: {
          ...(storeId ? { OR: [{ storeId }, { uberStoreId: storeId }] } : {}),
          externalItemId: externalId,
        },
        select: { optionChoiceStableId: true },
      });
      stableId = config?.optionChoiceStableId;
    }
    const choice = choices.find((candidate) => candidate.stableId === stableId);
    return choice
      ? {
          stableId: choice.stableId,
          nameEn: choice.nameEn,
          nameZh: choice.nameZh,
        }
      : null;
  }

  private validateOrderAmounts(order: ParsedUberOrder) {
    const calculatedLinesCents = order.items.reduce(
      (sum, item) => sum + item.lineTotalCents,
      0,
    );
    const lineVarianceCents = order.subtotalCents - calculatedLinesCents;
    const calculatedTotalCents =
      order.subtotalCents -
      order.discountCents +
      order.taxCents +
      order.deliveryFeeCents;
    const totalVarianceCents = order.totalCents - calculatedTotalCents;
    const roundingToleranceCents = Math.max(1, order.items.length);
    return {
      calculatedLinesCents,
      calculatedTotalCents,
      lineVarianceCents,
      totalVarianceCents,
      roundingToleranceCents,
      hasMaterialVariance:
        Math.abs(lineVarianceCents) > roundingToleranceCents ||
        Math.abs(totalVarianceCents) > roundingToleranceCents,
    };
  }

  private parseOrderPayload(payload: unknown): ParsedUberOrder | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      return null;
    const dto = payload as UberOrderDetailDto;
    const charges = dto.payment?.charges;
    const promotions = dto.payment?.promotions;
    const externalOrderId = this.readString(
      dto.order_id,
      dto.id,
      dto.external_order_id,
    );
    const totalSource =
      dto.total ??
      dto.total_cents ??
      charges?.total ??
      charges?.total_promo_applied;
    if (!externalOrderId || totalSource === undefined) return null;
    const subtotalCents = this.readCents(
      dto.subtotal ?? dto.sub_total ?? charges?.sub_total ?? charges?.subtotal,
      dto.subtotal_cents,
      0,
    );
    const taxCents = this.readCents(
      dto.tax ?? charges?.tax_promo_applied ?? charges?.tax,
      dto.tax_cents,
      0,
    );
    const promoSubtotalCents = this.readOptionalCents(
      charges?.sub_total_promo_applied,
    );
    const promotionSavingsCents =
      promotions?.promotions?.reduce(
        (sum, promotion) =>
          sum +
          Math.max(0, promotion.promo_discount_value ?? 0) +
          Math.max(0, promotion.promo_delivery_fee_value ?? 0),
        0,
      ) ?? 0;
    const discountCents =
      dto.discount !== undefined ||
      dto.discount_cents !== undefined ||
      dto.discountCents !== undefined
        ? this.readCents(
            dto.discount,
            dto.discount_cents ?? dto.discountCents,
            0,
          )
        : promoSubtotalCents !== null
          ? Math.max(0, subtotalCents - promoSubtotalCents)
          : promotionSavingsCents;
    const hasPromotion =
      discountCents > 0 ||
      promoSubtotalCents !== null ||
      (promotions?.promotions?.length ?? 0) > 0;
    const deliveryFeeCents = this.readCents(
      dto.delivery_fee ?? charges?.total_fee ?? charges?.delivery_fee,
      undefined,
      0,
    );
    const items = (dto.items ?? dto.cart?.items ?? []).map((item) =>
      this.parseUberOrderItem(item),
    );
    const totalCents = this.readCents(
      dto.total ?? charges?.total ?? charges?.total_promo_applied,
      dto.total_cents,
      subtotalCents - discountCents + taxCents + deliveryFeeCents,
    );
    const customer = dto.customer ?? dto.eater ?? {};
    const eaterName = [
      this.readString(dto.eater?.first_name),
      this.readString(dto.eater?.last_name),
    ]
      .filter((value): value is string => !!value)
      .join(' ');
    return {
      externalOrderId,
      displayId: this.readString(dto.display_id),
      pickupCode: this.readString(dto.pickup_code, dto.display_id),
      storeId: this.readString(dto.store_id, dto.store?.id),
      subtotalCents,
      taxCents,
      totalCents,
      discountCents,
      hasPromotion,
      deliveryFeeCents,
      contactName: this.readString(
        customer.name,
        customer.full_name,
        eaterName,
      ),
      contactPhone: this.readString(customer.phone, customer.phone_number),
      paidAt:
        this.readDate(dto.paid_at, dto.created_at, dto.placed_at) ?? new Date(),
      fulfillmentType: this.readString(dto.fulfillment_type, dto.type)
        ?.toLowerCase()
        .includes('deliver')
        ? 'delivery'
        : 'pickup',
      estimatedReadyAt: this.readDate(
        dto.estimated_ready_for_pickup_at,
        dto.estimated_delivery_at,
      ),
      specialInstructions: this.readString(
        dto.special_instructions,
        dto.cart?.special_instructions,
      ),
      cancellation:
        dto.cancellation || dto.cancelled_at || dto.canceled_at
          ? {
              cancelledBy: this.readString(
                dto.cancellation?.cancelled_by,
                dto.cancellation?.canceled_by,
              ),
              reasonCode: this.readString(dto.cancellation?.reason_code),
              reasonDetail: this.readString(
                dto.cancellation?.reason,
                dto.cancellation?.details,
              ),
              occurredAt:
                this.readDate(dto.cancelled_at, dto.canceled_at) ?? new Date(),
            }
          : null,
      items,
    };
  }

  private parseUberOrderItem(item: UberOrderItemDto): ParsedUberOrderItem {
    const quantity = Math.max(1, Math.round(item.quantity ?? 1));
    const price = this.asObject(item.price);
    const modifiers = [
      ...(item.modifiers ?? []).map((modifier) =>
        this.parseUberModifier(modifier, null),
      ),
      ...(item.selected_modifier_groups ?? []).flatMap((group) =>
        (group.selected_items ?? []).map((modifier) =>
          this.parseUberModifier(modifier, group.id ?? null),
        ),
      ),
    ];
    const optionsUnitPriceCents = this.flattenUberModifiers(modifiers).reduce(
      (sum, modifier) => sum + modifier.priceDeltaCents * modifier.quantity,
      0,
    );
    const suppliedUnit = this.readCents(
      item.unit_price ?? price?.unit_price,
      item.price,
      0,
    );
    const suppliedLine = this.readCents(
      item.total_price ?? price?.total_price,
      undefined,
      suppliedUnit * quantity,
    );
    const unitPriceCents = suppliedUnit || Math.round(suppliedLine / quantity);
    return {
      externalLineId: this.readString(
        item.line_item_id,
        item.instance_id,
        item.id,
      ),
      externalItemId: this.readString(item.item_id, item.id),
      stableIdHint: this.readString(item.external_data),
      displayName:
        this.readString(item.title, item.name) ?? 'Unknown Uber item',
      quantity,
      baseUnitPriceCents: Math.max(0, unitPriceCents - optionsUnitPriceCents),
      optionsUnitPriceCents,
      unitPriceCents,
      lineTotalCents: suppliedLine,
      specialInstructions: this.readString(item.special_instructions),
      modifiers,
    };
  }

  private parseUberModifier(
    modifier: UberOrderModifierDto,
    parentExternalId: string | null,
  ): ParsedUberModifier {
    const externalId = this.readString(modifier.modifier_id, modifier.id);
    return {
      externalId,
      parentExternalId,
      displayName:
        this.readString(modifier.title, modifier.name) ?? 'Unknown modifier',
      quantity: Math.max(1, Math.round(modifier.quantity ?? 1)),
      priceDeltaCents: this.readCents(modifier.price_delta, modifier.price, 0),
      specialInstructions: this.readString(modifier.special_instructions),
      children: [
        ...(modifier.modifiers ?? []),
        ...(modifier.selected_items ?? []),
      ].map((child) => this.parseUberModifier(child, externalId)),
    };
  }

  private mapEventTypeToOrderStatus(eventType: string): OrderStatus | null {
    const normalized = normalizeUberEventType(eventType);

    if (normalized.includes('complete')) return OrderStatus.completed;
    if (normalized.includes('ready')) return OrderStatus.ready;
    if (normalized.includes('progress') || normalized.includes('making')) {
      return OrderStatus.making;
    }
    // Cancellation/rejection is captured separately. Refund is a local money
    // operation and must never be inferred from an Uber lifecycle event.
    if (normalized.includes('cancel') || normalized.includes('reject'))
      return null;
    if (normalized.includes('accept')) return OrderStatus.paid;
    if (normalized.includes('notification')) return OrderStatus.pending;

    return OrderStatus.pending;
  }

  private toClientRequestId(externalOrderId: string): string {
    return `ubereats:${externalOrderId}`;
  }

  private buildUberAuthenticationError(
    parsed: unknown,
    status: number,
  ): UberAuthenticationError {
    const body = this.asObject(parsed);
    const nestedError = this.asObject(body?.error);
    const code =
      this.readString(body?.code, nestedError?.code, body?.error) ??
      `UBER_HTTP_${status}`;
    const unsafeMessage =
      this.readString(
        body?.message,
        nestedError?.message,
        body?.error_description,
      ) ?? 'Uber authentication request was rejected';
    const message = unsafeMessage
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
      .replace(
        /\b(access[_ -]?token|client[_ -]?secret)\s*[:=]\s*\S+/gi,
        '$1=[REDACTED]',
      )
      .slice(0, 500);

    return { upstreamStatus: status, code: code.slice(0, 100), message };
  }

  private buildStableUberNodeId(
    nodeType: 'menu' | 'item' | 'group' | 'category' | 'publish',
    storeId: string,
    sourceStableId: string,
  ): string {
    const raw = `${nodeType}:${storeId}:${sourceStableId}`;
    return `sanq:${createHash('sha1').update(raw).digest('hex').slice(0, 24)}`;
  }

  private async ensureBusinessConfig() {
    const config = await this.prisma.businessConfig.findUnique({
      where: { id: 1 },
    });

    if (config) return config;

    return this.prisma.businessConfig.create({
      data: {
        id: 1,
        storeName: '',
      },
    });
  }

  private async captureEvent(eventName: string, payload: Prisma.JsonObject) {
    await this.prisma.opsEvent.create({
      data: {
        eventName,
        source: 'ubereats',
        payload,
      },
    });
  }

  private readDate(...values: unknown[]): Date | null {
    for (const value of values) {
      if (typeof value === 'string' || typeof value === 'number') {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) return date;
      }
    }
    return null;
  }

  private asObject(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }

  private readString(...values: unknown[]): string | null {
    for (const value of values) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0) return trimmed;
      }
    }
    return null;
  }

  private readCents(
    primary: unknown,
    fallback: unknown,
    defaultValue: number,
  ): number {
    const direct = this.toFiniteNumber(primary);
    if (direct !== null) return Math.max(0, Math.round(direct));

    const money = this.asObject(primary);
    const amount = this.toFiniteNumber(money?.amount);
    if (amount !== null) return Math.max(0, Math.round(amount));
    const value = this.toFiniteNumber(money?.value);
    if (value !== null) return Math.max(0, Math.round(value));

    const second = this.toFiniteNumber(fallback);
    if (second !== null) return Math.max(0, Math.round(second));

    return Math.max(0, Math.round(defaultValue));
  }

  private readOptionalCents(value: unknown): number | null {
    const direct = this.toFiniteNumber(value);
    if (direct !== null) return Math.max(0, Math.round(direct));

    const money = this.asObject(value);
    const amount = this.toFiniteNumber(money?.amount);
    if (amount !== null) return Math.max(0, Math.round(amount));
    const nestedValue = this.toFiniteNumber(money?.value);
    if (nestedValue !== null) return Math.max(0, Math.round(nestedValue));

    return null;
  }

  private toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }
}
