import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Optional,
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
import { OrderEventsBus } from '../../../../messaging/order-events.bus';
import {
  NormalizedOrderItem,
  OrderIngestionService,
} from '../../../../orders/order-ingestion.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { UberWebhookEnvelopeDto } from '../../contracts/dto/uber-webhook-envelope.dto';
import { UberAuthService } from '../../application/merchant/uber-auth.service';
import {
  UberConfigService,
  type UberOrderConfig,
} from '../../infrastructure/config/uber-config.service';
import {
  UberHttpClient,
  UberHttpResult,
} from '../../infrastructure/http/uber-http.client';
import {
  normalizeUberEventType,
  normalizeUberStoreId,
  redactUberLogText,
  summarizeUberDebugResponse,
  UberWebhookNonRetryableError,
} from '../../domain/shared/uber-integration.utils';
import type {
  ParsedUberModifier,
  ParsedUberOrder,
  ParsedUberOrderItem,
  UberOrderActionName,
  UberOrderActionRecord,
  UberOrderActionResult,
} from '../../domain/orders/uber-order.types';
import { UberPrismaAccessService } from '../../infrastructure/persistence/uber-prisma-access.service';
import {
  UberOrderPayloadParser,
  mapUberEventTypeToOrderStatus,
  validateUberOrderAmounts,
} from '../../domain/orders/uber-order-payload.parser';
import { UberOrderActionService } from '../../application/orders/uber-order-action.service';
import { UberOrderOutboxService } from '../../application/orders/uber-order-outbox.service';
import { UberOrderStatusSyncService } from '../../application/orders/uber-order-status-sync.service';
import { UberOrderStateMachine } from '../../domain/orders/uber-order.state-machine';
import { UberOrderGateway } from '../../infrastructure/api/uber-resource.gateways';
import { toUberEatsHttpException } from '../../application/uber-domain-error.mapper';
import { toUberOrderStatus } from '../../infrastructure/persistence/uber-order-status.mapper';

import { UberTelemetryService } from '../../infrastructure/observability/uber-telemetry.service';

@Injectable()
export class UberOrderPrismaAdapter {
  private static readonly UBER_MODIFIER_COMBINATION_LIMIT = 100;
  private readonly telemetry: UberTelemetryService;
  private readonly payloadParser = new UberOrderPayloadParser();
  private readonly actionService: UberOrderActionService;
  private readonly outboxService: UberOrderOutboxService;
  private readonly statusSyncService: UberOrderStatusSyncService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly uberAuthService: UberAuthService,
    private readonly orderEventsBus: OrderEventsBus,
    private readonly orderIngestionService: OrderIngestionService,
    private readonly httpClient: UberHttpClient,
    @Inject(UberConfigService) private readonly config: UberOrderConfig,
    private readonly prismaAccess: UberPrismaAccessService,
    private readonly orderGateway: UberOrderGateway,
    @Optional() actionService?: UberOrderActionService,
    @Optional() outboxService?: UberOrderOutboxService,
    @Optional() statusSyncService?: UberOrderStatusSyncService,
    @Optional() telemetry?: UberTelemetryService,
  ) {
    this.actionService =
      actionService ??
      new UberOrderActionService(uberAuthService, httpClient, config);
    this.outboxService =
      outboxService ??
      new UberOrderOutboxService(prisma, prismaAccess, this.actionService);
    this.telemetry = telemetry ?? new UberTelemetryService(prisma);
    this.statusSyncService =
      statusSyncService ?? new UberOrderStatusSyncService(prisma);
  }

  async syncOrderStatusToUber(externalOrderId: string, status: OrderStatus) {
    const clientRequestId = this.toClientRequestId(externalOrderId);
    const order = await this.prisma.order.findUnique({
      where: { clientRequestId },
      select: { id: true, orderStableId: true, status: true },
    });

    if (!order) {
      await this.telemetry.captureEvent('ubereats_order_sync_failed', {
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

    const action = this.statusSyncService.actionFor(status);
    if (!action) {
      throw new BadRequestException(
        `本地状态 ${status} 没有 Uber 文档支持的外部动作`,
      );
    }

    try {
      UberOrderStateMachine.assertCanRequestAction(
        toUberOrderStatus(order.status),
        action,
      );
    } catch (error) {
      throw toUberEatsHttpException(error);
    }

    // Commit only the durable intent. A confirmed worker response owns the
    // local transition, so a timeout can never masquerade as Uber success.
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.uberOrderAction.upsert({
        where: { externalOrderId_action: { externalOrderId, action } },
        create: { externalOrderId, action, status: 'PENDING' },
        update: {},
      });
      return { orderStableId: order.orderStableId, status: order.status };
    });

    const queued = await this.outboxService.enqueue(externalOrderId, action);
    const result = this.toUberOrderActionResult(queued, true);

    await this.telemetry.captureEvent('ubereats_order_status_synced', {
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
    return this.prismaAccess.uberOrderActionRepository.findUnique({
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
    const queued = await this.prismaAccess.uberOrderActionRepository.update({
      where: { id: record.id },
      data: { status: 'PENDING', retryable: true, nextRetryAt: new Date() },
    });
    return this.toUberOrderActionResult(queued, true);
  }

  /** Queue workers can periodically drain retryable/PENDING outbox rows. */

  async processPendingUberOrderActions(limit = 50) {
    return this.outboxService.processPending(
      limit,
      (externalOrderId, action, payload) =>
        this.executeUberOrderAction(externalOrderId, action, payload, true),
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
    const record = await this.outboxService.enqueue(
      normalizedOrderId,
      'ACCEPT',
    );
    return this.toUberOrderActionResult(record, record.status !== 'PENDING');
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
    const record = await this.outboxService.enqueue(
      externalOrderId.trim(),
      'DENY',
      {
        reasonCode: normalizedReason,
        reasonDetail: reasonDetail?.trim() || undefined,
      },
    );
    return this.toUberOrderActionResult(record, record.status !== 'PENDING');
  }

  private buildUberDenyOrderPayload(reasonCode: string, reasonDetail?: string) {
    return this.actionService.buildDenyPayload(reasonCode, reasonDetail);
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

  async getPendingUberOrdersSummary() {
    const where = {
      channel: Channel.ubereats,
      status: {
        in: [OrderStatus.pending, OrderStatus.paid, OrderStatus.making],
      },
    };
    const [count, latest] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findFirst({
        where,
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);
    return { count, updatedAt: latest?.createdAt ?? null };
  }

  async processWebhookEvent(
    eventType: string,
    eventId: string,
    envelope: UberWebhookEnvelopeDto | null,
  ) {
    if (!envelope) {
      throw new BadRequestException('Uber 订单 webhook envelope 无效');
    }

    const resourcePath = await this.orderGateway.pathFromResourceHref(
      envelope.resourceHref,
    );
    const orderPayload = await this.fetchUberOrderDetail(resourcePath, {
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

    if (mapUberEventTypeToOrderStatus(eventType) !== null) {
      await this.enqueueAndBestEffortAcceptUberOrder(
        parsedOrder.externalOrderId,
        {
          eventType,
          eventId,
          orderStableId: order.orderStableId,
        },
      );
    }

    await this.telemetry.captureEvent('ubereats_webhook_processed', {
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
        this.telemetry.workflowLog(
          'warn',
          `[ubereats webhook deny] non-retryable upstream failure swallowed externalOrderId=${externalOrderId} eventType=${context.eventType} eventId=${context.eventId} status=${status} retryable=false detail=${redactedDetail ?? 'unknown'}`,
        );
        await this.telemetry.captureEvent('ubereats_webhook_auto_deny_failed', {
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
    return this.actionService.isNonRetryableStatus(status);
  }

  private async enqueueAndBestEffortAcceptUberOrder(
    externalOrderId: string,
    context: {
      eventType: string;
      eventId: string;
      orderStableId: string;
    },
  ) {
    await this.telemetry.captureEvent('ubereats_order_accept_queued', {
      externalOrderId,
      eventType: context.eventType,
      eventId: context.eventId,
      orderStableId: context.orderStableId,
    });
  }

  private async fetchUberOrderDetail(
    resourcePath: string,
    context: {
      eventType: string;
      eventId: string;
      resourceId?: string | null;
    },
  ): Promise<unknown> {
    const result = await this.requestUberOrderDetail(resourcePath);
    const { response, text: rawText, data: parsed } = result;

    if (response.ok) {
      return parsed;
    }

    const detail = summarizeUberDebugResponse(parsed, rawText);
    const uberRequestId =
      response.headers.get('x-uber-request-id') ??
      response.headers.get('x-request-id') ??
      response.headers.get('trace-id');

    this.telemetry.workflowLog(
      'error',
      `[ubereats order] detail fetch failed status=${response.status} eventType=${context.eventType} eventId=${context.eventId} resourceId=${context.resourceId ?? 'unknown'} resourcePath=${resourcePath.split('?')[0]} uberRequestId=${uberRequestId ?? 'unknown'} detail=${redactUberLogText(detail)}`,
    );

    const payload = {
      ok: false,
      status: response.status,
      message: 'Uber 订单详情接口返回错误',
      detail,
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
    resourcePath: string,
  ): Promise<UberHttpResult> {
    try {
      return await this.orderGateway.inspect({
        path: resourcePath,
        method: 'GET',
        operation: 'uber.order.detail',
        scope: 'eats.store.orders.read',
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
    const delegate = this.prismaAccess.uberOrderActionRepository;
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
    } else if (record.status !== 'PROCESSING') {
      record = await delegate.update({
        where: { id: record.id },
        data: {
          status: 'PENDING',
          retryable: false,
          attemptCount: { increment: 1 },
        },
      });
    }

    const pathname = this.actionService.buildPath(externalOrderId, action);
    let response: Response;
    let rawText = '';
    let parsed: unknown = {};
    try {
      ({
        response,
        text: rawText,
        data: parsed,
      } = await this.actionService.request(externalOrderId, action, payload));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorType = error instanceof Error ? error.name : typeof error;
      const redactedError = redactUberLogText(errorMessage);
      await delegate.update({
        where: { id: record.id },
        data: {
          status:
            (record.attemptCount ?? 1) >= UberOrderOutboxService.MAX_ATTEMPTS
              ? 'DEAD'
              : 'FAILED',
          retryable:
            (record.attemptCount ?? 1) < UberOrderOutboxService.MAX_ATTEMPTS,
          lastError: redactedError
            .replace(/(token|secret|authorization)=?[^\s&]*/gi, '$1=[REDACTED]')
            .slice(0, 2_000),
          response: this.redactUberResponse({
            error: errorMessage,
          }),
          nextRetryAt:
            (record.attemptCount ?? 1) >= UberOrderOutboxService.MAX_ATTEMPTS
              ? null
              : new Date(
                  Date.now() +
                    Math.min(
                      300_000,
                      1_000 * 2 ** Math.max(0, (record.attemptCount ?? 1) - 1),
                    ),
                ),
          leaseToken: null,
          leaseExpiresAt: null,
        },
      });
      this.telemetry.workflowLog(
        'error',
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
    const { succeeded, retryable } = this.actionService.classify(
      action,
      response,
    );
    const uberRequestId =
      response.headers.get('x-request-id') ??
      response.headers.get('uber-request-id');
    await delegate.update({
      where: { id: record.id },
      data: {
        status: succeeded
          ? 'SUCCEEDED'
          : retryable &&
              (record.attemptCount ?? 1) >= UberOrderOutboxService.MAX_ATTEMPTS
            ? 'DEAD'
            : 'FAILED',
        uberHttpStatus: response.status,
        retryable:
          retryable &&
          (record.attemptCount ?? 1) < UberOrderOutboxService.MAX_ATTEMPTS,
        uberRequestId,
        lastError: succeeded
          ? null
          : summarizeUberDebugResponse(parsed, rawText).slice(0, 2_000),
        response: this.redactUberResponse(
          parsed ?? { body: rawText.slice(0, 2_000) },
        ),
        ...(succeeded ? { completedAt: new Date() } : {}),
        nextRetryAt: retryable
          ? new Date(
              Date.now() +
                Math.min(
                  300_000,
                  1_000 * 2 ** Math.max(0, (record.attemptCount ?? 1) - 1),
                ),
            )
          : null,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
    if (!succeeded) {
      this.telemetry.workflowLog(
        'error',
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
    await this.advanceLocalUberOrderStatusAfterConfirmedAction(
      externalOrderId,
      action,
    );
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
    const status = record.status;
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
    const orderDelegate = this.prisma.order;

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

  private async advanceLocalUberOrderStatusAfterConfirmedAction(
    externalOrderId: string,
    action: UberOrderActionName,
  ): Promise<void> {
    if (action === 'ACCEPT') {
      await this.advanceLocalUberOrderStatusAfterAccept(externalOrderId);
      return;
    }
    if (action !== 'READY_FOR_PICKUP') return;
    await this.prisma.order.updateMany({
      where: {
        clientRequestId: this.toClientRequestId(externalOrderId),
        status: { in: [OrderStatus.paid, OrderStatus.making] },
      },
      data: { status: OrderStatus.ready, readyAt: new Date() },
    });
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
    const txLike = this.prisma;
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
        const isCancellation =
          normalizedEvent === 'orders.cancelled' ||
          normalizedEvent === 'orders.cancel' ||
          normalizedEvent === 'orders.rejected';
        if (isCancellation) {
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
        // The order graph, inbox result and first external intent become
        // visible together. No process may call Uber before this commits.
        if (!isCancellation) {
          await tx.uberOrderAction.upsert({
            where: {
              externalOrderId_action: {
                externalOrderId: order.externalOrderId,
                action: 'ACCEPT',
              },
            },
            create: {
              externalOrderId: order.externalOrderId,
              action: 'ACCEPT',
              status: 'PENDING',
              reasonCode: 'accepted',
            },
            update: {},
          });
        }
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
      this.telemetry.workflowLog(
        'warn',
        `[ubereats order] amount variance externalOrderId=${order.externalOrderId} line=${amountValidation.lineVarianceCents} total=${amountValidation.totalVarianceCents} menu=${menuPriceVarianceCents}`,
      );
    }
    await this.telemetry.captureEvent('ubereats_order_upserted', {
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
    const delegate = this.prisma.uberStoreMapping;
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
    const delegate = tx.uberPublishedMenuItem;
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
        const snapshot = await tx.uberPublishedMenuItem.findFirst({
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
      this.telemetry.workflowLog(
        'warn',
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
    return validateUberOrderAmounts(order);
  }

  private parseOrderPayload(payload: unknown): ParsedUberOrder | null {
    return this.payloadParser.parse(payload);
  }

  private mapEventTypeToOrderStatus(eventType: string): OrderStatus | null {
    return mapUberEventTypeToOrderStatus(eventType);
  }

  private toClientRequestId(externalOrderId: string): string {
    return `ubereats:${externalOrderId}`;
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
