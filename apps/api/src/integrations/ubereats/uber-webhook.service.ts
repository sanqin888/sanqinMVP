import {
  BadRequestException,
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { AppLogger } from '../../common/app-logger';
import { PrismaService } from '../../prisma/prisma.service';
import { UberWebhookEnvelopeDto } from './dto/uber-webhook-envelope.dto';
import {
  UberConfigService,
  type UberWebhookConfig,
} from './uber-config.service';
import {
  normalizeUberEventType,
  redactUberLogText,
  UberWebhookNonRetryableError,
} from './uber-integration.utils';
import { UberMenuService } from './uber-menu.service';
import { UberOrderService } from './uber-order.service';
import { UberPrismaAccessService } from './uber-prisma-access.service';
import type { UberWebhookInput } from './uber-webhook.types';

@Injectable()
export class UberWebhookService implements OnModuleInit, OnModuleDestroy {
  private static readonly UBER_MODIFIER_COMBINATION_LIMIT = 100;
  private static readonly MAX_ATTEMPTS = 8;
  private static readonly LEASE_MS = 60_000;
  private workerTimer?: NodeJS.Timeout;
  private workerRunning = false;
  private readonly logger = new AppLogger(UberWebhookService.name);
  private readonly webhookSigningKey: string;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(UberConfigService) config: UberWebhookConfig,
    private readonly orders: UberOrderService,
    private readonly menu: UberMenuService,
    private readonly prismaAccess: UberPrismaAccessService,
  ) {
    this.webhookSigningKey = config.getWebhookSigningKey();
  }

  onModuleInit(): void {
    void this.runRecoveryScan();
    this.workerTimer = setInterval(() => void this.runRecoveryScan(), 15_000);
    this.workerTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.workerTimer) clearInterval(this.workerTimer);
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

    const persisted = await this.persistWebhookEvent(
      eventId,
      eventType,
      envelope?.resourceId ?? null,
      body,
    );
    if (!persisted) {
      this.logger.warn(
        `[ubereats webhook] duplicate ignored eventType=${eventType} eventId=${eventId}`,
      );
      return;
    }
  }

  /** Worker boundary: only this method is allowed to invoke webhook use cases. */
  async processDueWebhooks(limit = 50): Promise<number> {
    const leaseToken = randomUUID();
    const rows = await this.prisma.$queryRaw<
      Array<{ eventId: string; eventType: string; payload: unknown }>
    >`
      WITH candidates AS (
        SELECT id FROM "UberWebhookInbox"
        WHERE ((status IN ('PENDING', 'FAILED') AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= NOW()))
          OR (status = 'PROCESSING' AND "leaseExpiresAt" <= NOW()))
          AND "attemptCount" < ${UberWebhookService.MAX_ATTEMPTS}
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED LIMIT ${limit}
      )
      UPDATE "UberWebhookInbox" inbox SET status = 'PROCESSING',
        "processingAt" = NOW(), "leaseToken" = ${leaseToken},
        "leaseExpiresAt" = NOW() + (${UberWebhookService.LEASE_MS} * INTERVAL '1 millisecond'),
        "attemptCount" = inbox."attemptCount" + 1
      FROM candidates WHERE inbox.id = candidates.id
      RETURNING inbox."eventId", inbox."eventType", inbox.payload
    `;
    for (const row of rows) await this.processClaimedWebhook(row, leaseToken);
    return rows.length;
  }

  private async processClaimedWebhook(
    row: { eventId: string; eventType: string; payload: unknown },
    leaseToken: string,
  ): Promise<void> {
    const { eventId, eventType } = row;
    const body = row.payload;
    const envelope = UberWebhookEnvelopeDto.parse(body);
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
      await this.prismaAccess.uberWebhookInboxRepository.updateMany({
        where: { eventId, status: 'PROCESSING', leaseToken },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
          errorSummary: null,
          nextRetryAt: null,
          leaseToken: null,
          leaseExpiresAt: null,
          structuredError: Prisma.DbNull,
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
      await this.markWebhookFailed(eventId, leaseToken, error, {
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
      this.logger.error(`[ubereats webhook worker] eventId=${eventId} failed`);
    }
  }

  private async runRecoveryScan(): Promise<void> {
    if (this.workerRunning) return;
    this.workerRunning = true;
    try {
      await this.processDueWebhooks();
      await this.orders.processPendingUberOrderActions();
      await this.menu.recoverTimedOutPublications();
      await this.reportQueueHealth();
    } catch (error) {
      this.logger.error(
        `[ubereats recovery] ${this.summarizeWebhookError(error)}`,
      );
    } finally {
      this.workerRunning = false;
    }
  }

  private async reportQueueHealth(): Promise<void> {
    const [metrics] = await this.prisma.$queryRaw<
      Array<Record<string, bigint | number | null>>
    >`
      SELECT
        (SELECT COUNT(*) FROM "UberWebhookInbox" WHERE status IN ('PENDING','FAILED')) AS "webhookBacklog",
        (SELECT COUNT(*) FROM "UberOrderAction" WHERE status IN ('PENDING','FAILED')) AS "actionBacklog",
        (SELECT COUNT(*) FROM "UberWebhookInbox" WHERE status = 'DEAD') +
          (SELECT COUNT(*) FROM "UberOrderAction" WHERE status = 'DEAD') AS "deadLetters",
        (SELECT COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - "createdAt"))), 0) FROM "UberWebhookInbox" WHERE status IN ('PENDING','FAILED')) AS "oldestAgeSeconds",
        (SELECT COALESCE(SUM("attemptCount"), 0) FROM "UberWebhookInbox") +
          (SELECT COALESCE(SUM("attemptCount"), 0) FROM "UberOrderAction") AS retries,
        (SELECT COUNT(*) FROM "UberWebhookInbox" WHERE status = 'FAILED' AND "updatedAt" > NOW() - INTERVAL '5 minutes') AS "recentFailures"
    `;
    const normalized = Object.fromEntries(
      Object.entries(metrics ?? {}).map(([key, value]) => [
        key,
        Number(value ?? 0),
      ]),
    );
    this.logger.log(`[ubereats queue metrics] ${JSON.stringify(normalized)}`);
    if (
      (normalized.webhookBacklog ?? 0) + (normalized.actionBacklog ?? 0) >=
        100 ||
      (normalized.recentFailures ?? 0) >= 5
    ) {
      this.logger.error(
        `[ubereats queue alert] backlog_or_consecutive_failures ${JSON.stringify(normalized)}`,
      );
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
    const storeMapping = this.prismaAccess.uberStoreMappingRepository;

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

  private async persistWebhookEvent(
    eventId: string,
    eventType: string,
    externalOrderId: string | null,
    payload: unknown,
  ): Promise<boolean> {
    const data: Prisma.UberWebhookInboxCreateArgs['data'] = {
      eventId,
      eventType,
      externalOrderId,
      status: 'PENDING',
      payload: this.toJsonValue(payload),
    };

    try {
      await this.prismaAccess.uberWebhookInboxRepository.create({ data });
    } catch (error) {
      if (!this.isPrismaUniqueConstraintError(error)) throw error;

      return false;
    }
    return true;
  }

  private async markWebhookFailed(
    eventId: string,
    leaseToken: string,
    error: unknown,
    options: { retryable?: boolean } = {},
  ) {
    const retryable = options.retryable ?? true;
    const summary = this.summarizeWebhookError(error);
    const current =
      await this.prismaAccess.uberWebhookInboxRepository.findUnique({
        where: { eventId },
        select: { attemptCount: true },
      });
    const dead =
      !retryable ||
      (current?.attemptCount ?? 0) >= UberWebhookService.MAX_ATTEMPTS;
    const attempts = current?.attemptCount ?? 1;
    await this.prismaAccess.uberWebhookInboxRepository.updateMany({
      where: { eventId, status: 'PROCESSING', leaseToken },
      data: {
        status: dead ? 'DEAD' : 'FAILED',
        errorSummary: summary || 'unknown error',
        structuredError: this.toJsonValue({
          message: summary,
          ...this.safeStructuredError(error),
          retryable,
        }),
        nextRetryAt: dead
          ? null
          : new Date(
              Date.now() + Math.min(300_000, 1_000 * 2 ** (attempts - 1)),
            ),
        leaseToken: null,
        leaseExpiresAt: null,
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
