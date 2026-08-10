import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { parseUberWebhookEnvelopeV1 } from '../../contracts/events/uber-webhook-envelope.v1';
import { parseUberOrderNotificationV1 } from '../../contracts/events/uber-order-notification.v1';
import { parseUberMenuNotificationV1 } from '../../contracts/events/uber-menu-notification.v1';
import { normalizeUberEventType } from '../../domain/shared/uber-integration.utils';
import type { UberWebhookInput } from '../../domain/webhook/uber-webhook.types';
import { UberMenuPublishService } from '../menu/uber-menu-publish.service';
import {
  UBER_TELEMETRY_PORT,
  UBER_WEBHOOK_INBOX_PORT,
  UBER_WEBHOOK_SIGNATURE_VERIFIER,
  type UberTelemetryPort,
  type UberWebhookInboxItem,
  type UberWebhookInboxPort,
  type UberWebhookSignatureVerifier,
} from '../ports/uber-order-processing.ports';
import { ImportUberOrderUseCase } from './uber-order.use-cases';
import {
  UberApplicationError,
  UberValidationError,
} from '../errors/uber-application.error';

/** Application use case that receives and routes durable webhook events. */
@Injectable()
export class ProcessUberWebhookInboxWorker {
  constructor(
    @Inject(UBER_WEBHOOK_INBOX_PORT)
    private readonly inbox: UberWebhookInboxPort,
    @Inject(UBER_WEBHOOK_SIGNATURE_VERIFIER)
    private readonly signatures: UberWebhookSignatureVerifier,
    private readonly orders: ImportUberOrderUseCase,
    private readonly menu: UberMenuPublishService,
    @Inject(UBER_TELEMETRY_PORT) private readonly telemetry: UberTelemetryPort,
  ) {}

  async handleWebhook(input: UberWebhookInput): Promise<void> {
    this.signatures.verify(input.headers, input.rawBody);
    let body: unknown;
    try {
      body = JSON.parse(
        Buffer.isBuffer(input.rawBody)
          ? input.rawBody.toString('utf8')
          : input.rawBody,
      );
    } catch {
      throw new UberValidationError({
        code: 'UBER_WEBHOOK_JSON_INVALID',
        message: 'Uber webhook JSON 无效',
        operation: 'webhook.parse-json',
      });
    }
    const envelope = parseUberWebhookEnvelopeV1(body);
    const eventType = envelope?.eventType ?? this.readEventType(body);
    if (eventType === 'unknown') {
      throw new UberValidationError({
        code: 'UBER_WEBHOOK_ENVELOPE_INVALID',
        message: 'Uber webhook envelope 无效',
        operation: 'webhook.parse-envelope',
      });
    }
    const eventId =
      this.readEventId(input.headers, body, envelope?.eventId) ??
      `sha256:${this.hashCanonicalBody(body)}`;
    const inserted = await this.inbox.enqueue({
      eventId,
      eventType,
      externalOrderId: envelope?.resourceId ?? null,
      payload: body,
    });
    if (!inserted)
      this.telemetry.workflowLog('warn', 'duplicate webhook ignored');
  }

  async processDueWebhooks(limit = 50): Promise<number> {
    const rows = await this.inbox.claimDue(limit);
    for (const row of rows) await this.route(row);
    return rows.length;
  }

  private async route(item: UberWebhookInboxItem): Promise<void> {
    const { eventId, eventType, payload } = item;
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
        case 'orders.rejected': {
          const order = parseUberOrderNotificationV1(payload);
          if (!order)
            throw new UberValidationError({
              code: 'UBER_ORDER_WEBHOOK_INVALID',
              message: 'Uber 订单 webhook envelope 无效',
              operation: 'webhook.route-order',
            });
          await this.orders.execute(eventType, eventId, order);
          break;
        }
        case 'menus.notification': {
          const menu = parseUberMenuNotificationV1(payload);
          if (!menu)
            throw new UberValidationError({
              code: 'UBER_MENU_WEBHOOK_INVALID',
              message: 'Uber 菜单 webhook payload 无效',
              operation: 'webhook.route-menu',
            });
          await this.menu.processWebhookEvent(eventType, eventId, menu);
          break;
        }
        case 'store.provisioned':
        case 'store.deprovisioned': {
          const storeId = this.extractStoreId(payload);
          if (storeId)
            await this.inbox.setStoreProvisioned(
              storeId,
              normalizeUberEventType(eventType) === 'store.provisioned',
            );
          await this.telemetry.captureEvent(
            `ubereats_${normalizeUberEventType(eventType).replaceAll('.', '_')}`,
            { eventType, eventId },
          );
          break;
        }
        case 'store.status.changed':
          await this.telemetry.captureEvent('ubereats_store_status_changed', {
            eventType,
            eventId,
          });
          break;
        default:
          await this.telemetry.captureEvent('ubereats_webhook_unhandled', {
            eventType,
            eventId,
          });
          if (/(^|[._-])orders?([._-]|$)/i.test(eventType))
            throw new UberValidationError({
              code: 'UBER_WEBHOOK_EVENT_UNSUPPORTED',
              message: '未识别的 Uber 订单事件类型',
              operation: 'webhook.route',
            });
      }
      await this.inbox.markSucceeded(item);
    } catch (error) {
      const retryable =
        error instanceof UberApplicationError ? error.retryable : true;
      await this.inbox.markFailed(item, error, retryable);
      if (retryable)
        this.telemetry.workflowLog('error', 'webhook processing failed');
    }
  }

  private readEventType(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return 'unknown';
    const root = payload as Record<string, unknown>;
    return (
      this.readString(root.event_type, root.type, root.action) ?? 'unknown'
    );
  }
  private readEventId(
    headers: Record<string, unknown>,
    payload: unknown,
    envelope?: string | null,
  ): string | null {
    for (const key of [
      'x-request-id',
      'x-uber-request-id',
      'x-event-id',
      'uber-event-id',
    ]) {
      const value = Object.entries(headers).find(
        ([name]) => name.toLowerCase() === key,
      )?.[1];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    if (envelope) return envelope;
    if (!payload || typeof payload !== 'object') return null;
    const root = payload as Record<string, unknown>;
    return this.readString(
      root.event_id,
      root.id,
      this.asObject(root.data)?.id,
    );
  }
  private hashCanonicalBody(payload: unknown): string {
    const normalize = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(normalize)
        : value && typeof value === 'object'
          ? Object.fromEntries(
              Object.entries(value as Record<string, unknown>)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, child]) => [key, normalize(child)]),
            )
          : value;
    return createHash('sha256')
      .update(JSON.stringify(normalize(payload)) ?? 'null')
      .digest('hex');
  }
  private extractStoreId(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const root = payload as Record<string, unknown>;
    const data = this.asObject(root.data);
    return this.readString(
      root.store_id,
      data?.store_id,
      this.asObject(data?.store)?.id,
    );
  }
  private asObject(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }
  private readString(...values: unknown[]): string | null {
    for (const value of values)
      if (typeof value === 'string' && value.trim()) return value.trim();
    return null;
  }
}
