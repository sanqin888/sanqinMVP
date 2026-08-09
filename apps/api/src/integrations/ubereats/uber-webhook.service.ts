import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { AppLogger } from '../../common/app-logger';
import { OrderEventsBus } from '../../messaging/order-events.bus';
import { OrderIngestionService } from '../../orders/order-ingestion.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UberWebhookEnvelopeDto } from './dto/uber-webhook-envelope.dto';
import { UberAuthService } from './uber-auth.service';
import { UberConfigService } from './uber-config.service';
import { UberHttpClient } from './uber-http.client';
import {
  normalizeUberEventType,
  redactUberLogText,
  UberWebhookNonRetryableError,
} from './uber-integration.utils';
import { UberMenuService } from './uber-menu.service';
import { UberOrderService } from './uber-order.service';
import type {
  UberMerchantConnectionDelegate,
  UberOAuthStateRequestDelegate,
  UberOrderActionDelegate,
  UberStoreMappingDelegate,
} from './uber-prisma.types';
import type { UberWebhookInput } from './uber-webhook.types';

@Injectable()
export class UberWebhookService {
  private static readonly UBER_MODIFIER_COMBINATION_LIMIT = 100;
  private readonly logger = new AppLogger(UberWebhookService.name);
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
    private readonly orders: UberOrderService,
    private readonly menu: UberMenuService,
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

  async handleWebhook(input: UberWebhookInput): Promise<void> {
    this.verifyWebhookSignature(input.headers, input.rawBody);

    let body: unknown;
    try {
      body = JSON.parse(
        Buffer.isBuffer(input.rawBody)
          ? input.rawBody.toString('utf8')
          : input.rawBody,
      );
    } catch {
      throw new BadRequestException('Uber webhook JSON 无效');
    }

    const envelope = UberWebhookEnvelopeDto.parse(body);
    const eventType = envelope?.eventType ?? this.readEventType(body);
    const eventId =
      this.readEventId(input.headers, body, envelope?.eventId) ??
      `sha256:${this.hashCanonicalBody(body)}`;

    const claimed = await this.claimWebhookEvent(
      eventId,
      eventType,
      envelope?.resourceId ?? null,
      body,
    );
    if (!claimed) {
      this.logger.warn(
        `[ubereats webhook] duplicate ignored eventType=${eventType} eventId=${eventId}`,
      );
      return;
    }

    try {
      switch (normalizeUberEventType(eventType)) {
        case 'orders.notification':
        case 'orders.accepted':
        case 'orders.in_progress':
        case 'orders.making':
        case 'orders.ready_for_pickup':
        case 'orders.completed':
        case 'orders.cancelled':
        case 'orders.cancel':
        case 'orders.rejected':
          await this.orders.processWebhookEvent(eventType, eventId, envelope);
          break;

        case 'store.provisioned':
          await this.handleStoreProvisionedWebhook(eventType, eventId, body);
          break;

        case 'store.deprovisioned':
          await this.handleStoreDeprovisionedWebhook(eventType, eventId, body);
          break;

        case 'store.status.changed':
          await this.handleStoreStatusChangedWebhook(eventType, eventId, body);
          break;

        case 'menus.notification':
          await this.menu.processWebhookEvent(eventType, eventId, body);
          break;

        default:
          await this.captureEvent('ubereats_webhook_unhandled', {
            eventType,
            eventId,
            orderRelated: this.isOrderRelatedEvent(eventType),
          });
          if (this.isOrderRelatedEvent(eventType)) {
            throw new BadRequestException(
              `未识别的 Uber 订单事件类型: ${eventType}`,
            );
          }
          break;
      }

      // Order persistence marks the inbox PROCESSED in the same transaction.
      // Other event families use this durable, retryable state-machine boundary.
      await this.prisma.uberWebhookInbox.updateMany({
        where: { eventId, status: 'PROCESSING' },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
          errorSummary: null,
          nextRetryAt: null,
        },
      });
    } catch (error) {
      const nonRetryable = error instanceof UberWebhookNonRetryableError;
      const retryable =
        !nonRetryable &&
        (!error ||
          typeof error !== 'object' ||
          !('retryable' in error) ||
          (error as { retryable?: unknown }).retryable === true);
      await this.markWebhookFailed(eventId, error, {
        retryable,
      });
      if (!retryable) {
        await this.captureEvent('ubereats_webhook_non_retryable_failed', {
          eventType,
          eventId,
          ...(nonRetryable
            ? { status: error.status, detail: error.detail }
            : this.safeStructuredError(error)),
        });
        return;
      }
      throw error;
    }
  }

  private async handleStoreProvisionedWebhook(
    eventType: string,
    eventId: string,
    payload: unknown,
  ) {
    const storeId = this.extractStoreId(payload);

    if (storeId) {
      await this.updateStoreProvisioningState(storeId, true);
    }

    await this.captureEvent('ubereats_store_provisioned', {
      eventType,
      eventId,
      storeId: storeId ?? 'unknown',
    });
  }

  private async handleStoreDeprovisionedWebhook(
    eventType: string,
    eventId: string,
    payload: unknown,
  ) {
    const storeId = this.extractStoreId(payload);

    if (storeId) {
      await this.updateStoreProvisioningState(storeId, false);
    }

    await this.captureEvent('ubereats_store_deprovisioned', {
      eventType,
      eventId,
      storeId: storeId ?? 'unknown',
    });
  }

  private async handleStoreStatusChangedWebhook(
    eventType: string,
    eventId: string,
    payload: unknown,
  ) {
    const storeId = this.extractStoreId(payload);

    await this.captureEvent('ubereats_store_status_changed', {
      eventType,
      eventId,
      storeId: storeId ?? 'unknown',
    });
  }

  private async updateStoreProvisioningState(
    storeId: string,
    isProvisioned: boolean,
  ): Promise<void> {
    const storeMapping = this.uberStoreMappingDelegate;
    if (!storeMapping) {
      throw new BadRequestException('Prisma 未配置 uberStoreMapping 模型');
    }

    const updated = await storeMapping.updateMany({
      where: { uberStoreId: storeId },
      data: {
        isProvisioned,
        provisionedAt: isProvisioned ? new Date() : null,
      },
    });

    if (!updated.count) {
      this.logger.warn(
        `[ubereats webhook] store mapping not found for provisioning update storeId=${storeId} isProvisioned=${isProvisioned}`,
      );
    }
  }

  private readEventType(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return 'unknown';
    const root = payload as Record<string, unknown>;
    return (
      this.readString(root.event_type, root.type, root.action) ?? 'unknown'
    );
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

  private verifyWebhookSignature(
    headers: Record<string, unknown>,
    rawBody: string | Buffer,
  ) {
    // Uber signs the exact UTF-8 request body with the webhook signing key
    // and sends the lowercase hexadecimal HMAC-SHA256 in X-Uber-Signature.
    const receivedSignature = this.readHeader(headers, 'x-uber-signature');
    if (!receivedSignature) {
      this.logger.warn(
        'Uber webhook signature verification failed signaturePresent=false',
      );
      throw new UnauthorizedException('Missing Uber signature header');
    }

    const normalizedSignature = receivedSignature.trim().toLowerCase();
    const signatureLength = normalizedSignature.length;
    const rawBodyBytes = Buffer.isBuffer(rawBody)
      ? rawBody.length
      : Buffer.byteLength(rawBody, 'utf8');
    if (!/^[0-9a-f]{64}$/.test(normalizedSignature)) {
      this.logger.warn(
        `Uber webhook signature verification failed signaturePresent=true signatureLength=${signatureLength} signatureEncoding=invalid rawBodyBytes=${rawBodyBytes}`,
      );
      throw new UnauthorizedException('Invalid Uber signature');
    }

    const receivedBuffer = Buffer.from(normalizedSignature, 'hex');
    const currentExpectedBuffer = createHmac('sha256', this.webhookSigningKey)
      .update(rawBody)
      .digest();
    const currentSecretMatched = timingSafeEqual(
      currentExpectedBuffer,
      receivedBuffer,
    );
    if (currentSecretMatched) return;

    const diagnostic =
      `signaturePresent=true signatureLength=${signatureLength} signatureEncoding=hex rawBodyBytes=${rawBodyBytes} ` +
      `currentSecretMatched=${currentSecretMatched}`;

    this.logger.warn(
      `Uber webhook signature verification failed ${diagnostic}`,
    );
    throw new UnauthorizedException('Invalid Uber signature');
  }

  private readEventId(
    headers: Record<string, unknown>,
    payload: unknown,
    envelopeEventId?: string | null,
  ): string | null {
    const fromHeader = this.readHeader(
      headers,
      'x-request-id',
      'x-uber-request-id',
      'x-event-id',
      'uber-event-id',
    );
    if (fromHeader) return fromHeader;
    if (envelopeEventId) return envelopeEventId;

    if (!payload || typeof payload !== 'object') return null;
    const root = payload as Record<string, unknown>;
    return this.readString(
      root.event_id,
      root.id,
      this.asObject(root.data)?.id,
    );
  }

  private async claimWebhookEvent(
    eventId: string,
    eventType: string,
    externalOrderId: string | null,
    payload: unknown,
  ): Promise<boolean> {
    const data = {
      eventId,
      eventType,
      externalOrderId,
      status: 'RECEIVED',
      payload: this.toJsonValue(payload),
    };

    try {
      await this.prisma.uberWebhookInbox.create({ data });
    } catch (error) {
      if (!this.isPrismaUniqueConstraintError(error)) throw error;

      // A failed synchronous attempt returned non-2xx, so a later delivery is
      // allowed to atomically reclaim it. All other conflicts are idempotent
      // success, including concurrent deliveries while the owner is working.
      const reclaimed = await this.prisma.uberWebhookInbox.updateMany({
        where: {
          eventId,
          status: 'FAILED',
          nextRetryAt: { not: null },
        },
        data: {
          status: 'RECEIVED',
          errorSummary: null,
          nextRetryAt: null,
        },
      });
      if (reclaimed.count === 0) return false;
    }

    const processing = await this.prisma.uberWebhookInbox.updateMany({
      where: { eventId, status: 'RECEIVED' },
      data: {
        status: 'PROCESSING',
        processingAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });
    return processing.count === 1;
  }

  private async markWebhookFailed(
    eventId: string,
    error: unknown,
    options: { retryable?: boolean } = {},
  ) {
    const retryable = options.retryable ?? true;
    const summary = this.summarizeWebhookError(error);
    await this.prisma.uberWebhookInbox.updateMany({
      where: { eventId, status: 'PROCESSING' },
      data: {
        status: 'FAILED',
        errorSummary: summary || 'unknown error',
        nextRetryAt: retryable ? new Date(Date.now() + 1_000) : null,
      },
    });
  }

  private summarizeWebhookError(error: unknown): string {
    const structured = this.safeStructuredError(error);
    if (structured.code) {
      return `${structured.code}: ${structured.detail ?? 'Uber request failed'}`.slice(
        0,
        500,
      );
    }
    const nestResponse =
      error &&
      typeof error === 'object' &&
      'getResponse' in error &&
      typeof (error as { getResponse?: unknown }).getResponse === 'function'
        ? (error as { getResponse: () => unknown }).getResponse()
        : null;
    const rawSummary = nestResponse
      ? JSON.stringify(nestResponse)
      : error instanceof Error
        ? error.message
        : String(error);

    return redactUberLogText(rawSummary).slice(0, 500);
  }

  private safeStructuredError(error: unknown): {
    code?: string;
    detail?: string;
    operation?: string;
  } {
    if (!error || typeof error !== 'object') return {};
    const value = error as Record<string, unknown>;
    return {
      ...(typeof value.uberCode === 'string' ? { code: value.uberCode } : {}),
      ...(typeof value.safeDetail === 'string'
        ? { detail: redactUberLogText(value.safeDetail) }
        : {}),
      ...(typeof value.operation === 'string'
        ? { operation: value.operation }
        : {}),
    };
  }

  private isPrismaUniqueConstraintError(error: unknown): boolean {
    return (
      !!error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }

  private isOrderRelatedEvent(eventType: string): boolean {
    return /(^|[._-])orders?([._-]|$)/i.test(eventType);
  }

  private hashCanonicalBody(payload: unknown): string {
    const normalize = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(normalize);
      if (value && typeof value === 'object') {
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, child]) => [key, normalize(child)]),
        );
      }
      return value;
    };
    return createHash('sha256')
      .update(JSON.stringify(normalize(payload)) ?? 'null', 'utf8')
      .digest('hex');
  }

  private toJsonValue(payload: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(payload ?? null)) as Prisma.InputJsonValue;
  }

  private extractStoreId(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;

    const root = payload as Record<string, unknown>;
    const dataNode = this.asObject(root.data);

    return this.readString(
      root.store_id,
      dataNode?.store_id,
      this.asObject(dataNode?.store)?.id,
    );
  }

  private readHeader(
    headers: Record<string, unknown>,
    ...keys: string[]
  ): string | null {
    const acceptedKeys = new Set(keys.map((key) => key.toLowerCase()));
    for (const [key, value] of Object.entries(headers)) {
      if (!acceptedKeys.has(key.toLowerCase())) continue;
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (Array.isArray(value)) {
        for (const item of value as unknown[]) {
          if (typeof item === 'string' && item.trim()) return item.trim();
        }
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
}
