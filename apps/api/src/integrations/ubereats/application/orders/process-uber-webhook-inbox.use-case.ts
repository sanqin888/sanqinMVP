<<<<<<< HEAD
import { type UberTelemetryPort } from '../shared/uber-telemetry.port';
import { createHash } from 'crypto';
import { dispatchUberWebhookV1 } from '../../domain/webhook/uber-webhook-event.parser';
import { UberMenuNotificationHandler } from '../menu/uber-menu-notification.handler';
import { HandleUberMerchantWebhookHandler } from '../merchant/uber-merchant-webhook.handler';
import {
  type UberWebhookInboxItem,
  type UberWebhookInboxPort,
} from './uber-order-processing.ports';
import {
  ImportUberOrderUseCase,
  UberOrderStoreMappingError,
} from './uber-order.use-cases';
import {
  UberApplicationError,
  UberValidationError,
} from '../shared/uber-application.error';

/** Application use case that receives and routes durable webhook events. */
export class ProcessUberWebhookInboxUseCase {
  constructor(
=======
import { Inject, Injectable } from '@nestjs/common';
import { parseUberOrderNotificationV1 } from '../../contracts/events/uber-order-notification.v1';
import { parseUberMenuNotificationV1 } from '../../contracts/events/uber-menu-notification.v1';
import { normalizeUberEventType } from '../../domain/shared/uber-integration.utils';
import { UberMenuNotificationHandler } from '../menu/uber-menu-notification.handler';
import { HandleUberMerchantWebhookHandler } from '../merchant/uber-merchant-webhook.handler';
import {
  UBER_TELEMETRY_PORT,
  UBER_WEBHOOK_INBOX_PORT,
  type UberTelemetryPort,
  type UberWebhookInboxItem,
  type UberWebhookInboxPort,
} from '../ports/uber-order-processing.ports';
import { ImportUberOrderUseCase } from './uber-order.use-cases';
import {
  UberApplicationError,
  UberValidationError,
} from '../errors/uber-application.error';

/** Application use case that receives and routes durable webhook events. */
@Injectable()
export class ProcessUberWebhookInboxUseCase {
  constructor(
    @Inject(UBER_WEBHOOK_INBOX_PORT)
>>>>>>> origin/main
    private readonly inbox: UberWebhookInboxPort,
    private readonly orders: ImportUberOrderUseCase,
    private readonly menu: UberMenuNotificationHandler,
    private readonly merchant: HandleUberMerchantWebhookHandler,
<<<<<<< HEAD
    private readonly telemetry: UberTelemetryPort,
  ) {}

  async execute(limit = 50): Promise<number> {
    let completed = 0;
    // Claim immediately before processing so leases never wait behind slow rows.
    for (let index = 0; index < limit; index += 1) {
      const [row] = await this.inbox.claimDue(1);
      if (!row) break;
      await this.route(row);
      completed += 1;
    }
    return completed;
=======
    @Inject(UBER_TELEMETRY_PORT) private readonly telemetry: UberTelemetryPort,
  ) {}

  async execute(limit = 50): Promise<number> {
    const rows = await this.inbox.claimDue(limit);
    for (const row of rows) await this.route(row);
    return rows.length;
>>>>>>> origin/main
  }

  private async route(item: UberWebhookInboxItem): Promise<void> {
    const { eventId, eventType, payload } = item;
    try {
<<<<<<< HEAD
      const dispatched = dispatchUberWebhookV1({
        eventType,
        businessVersion: item.businessVersion,
        payload,
      });
      switch (dispatched.kind) {
        case 'order': {
          await this.orders.execute(
            eventType,
            eventId,
            dispatched.event,
            dispatched.ordering,
          );
          break;
        }
        case 'order-cancel': {
          await this.orders.execute(
            eventType,
            eventId,
            dispatched.event,
            dispatched.ordering,
          );
          break;
        }
        case 'menu': {
          const menu = dispatched.event;
=======
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
          await this.orders.execute(
            eventType,
            eventId,
            order,
            this.extractOrdering(payload),
          );
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
>>>>>>> origin/main
          await this.menu.handle({
            resourceId: menu.resourceId,
            status: menu.status,
            failures: menu.failures,
<<<<<<< HEAD
            // Replays after a crash retain the inbox-derived identity.
            idempotencyKey: item.idempotencyKey,
          });
          break;
        }
        case 'store-provisioning': {
          await this.merchant.execute(eventId, dispatched.event);
          break;
        }
        case 'unsupported': {
          await this.quarantine(item, 'high');
          return;
        }
        case 'invalid':
          throw new UberValidationError({
            code: 'UBER_WEBHOOK_INVALID',
            message: 'Uber webhook payload 无效',
            operation: 'webhook.dispatch',
          });
      }
      if (!(await this.inbox.markSucceeded(item)))
        throw new UberWebhookLeaseLostError(eventId, 'markSucceeded');
    } catch (error) {
      if (error instanceof UberWebhookLeaseLostError) {
        this.recordLeaseLost(error);
        throw error;
      }
      const retryable =
        error instanceof UberApplicationError ? error.retryable : true;
      if (!(await this.inbox.markFailed(item, error, retryable))) {
        const leaseLost = new UberWebhookLeaseLostError(eventId, 'markFailed');
        this.recordLeaseLost(leaseLost);
        throw leaseLost;
      }
      if (error instanceof UberOrderStoreMappingError) {
        await this.telemetry.captureEvent(
          'ubereats_order_store_mapping_alert',
          {
            priority: 'high',
            code: error.code,
            uberStoreId: error.uberStoreId,
            eventId: error.eventId,
            externalOrderId: error.externalOrderId,
          },
        );
        this.telemetry.workflowLog(
          'error',
          `HIGH: Uber order store mapping requires operator action (${error.code})`,
        );
      }
=======
          });
          break;
        }
        case 'store.provisioned':
        case 'store.deprovisioned': {
          await this.merchant.execute(eventType, eventId, payload);
          break;
        }
        case 'store.status.changed':
          await this.merchant.execute(eventType, eventId, payload);
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
>>>>>>> origin/main
      if (retryable)
        this.telemetry.workflowLog('error', 'webhook processing failed');
    }
  }

<<<<<<< HEAD
  private async quarantine(
    item: UberWebhookInboxItem,
    priority: 'high',
  ): Promise<void> {
    const safeSummary = this.safeEventSummary(item);
    const committed = await this.inbox.markUnsupported(item, {
      code: 'UBER_WEBHOOK_EVENT_UNSUPPORTED',
      eventType: item.eventType,
      safeSummary,
      businessVersion: item.businessVersion,
    });
    if (!committed)
      throw new UberWebhookLeaseLostError(item.eventId, 'markUnsupported');
    await this.telemetry.captureEvent('ubereats_webhook_unsupported', {
      priority,
      eventType: item.eventType,
      eventId: item.eventId,
      safeSummary,
      businessVersion: item.businessVersion,
    });
    this.telemetry.workflowLog(
      'error',
      'HIGH: unsupported Uber webhook quarantined',
    );
  }

  private recordLeaseLost(error: UberWebhookLeaseLostError): void {
    this.telemetry.workflowLog(
      'error',
      `webhook lease lost: eventId=${error.eventId};operation=${error.operation}`,
    );
  }

  private safeEventSummary(item: UberWebhookInboxItem): string {
    const digest = createHash('sha256')
      .update(JSON.stringify(item.payload ?? null))
      .digest('hex')
      .slice(0, 16);
    return `type=${item.eventType};payloadSha256=${digest}`;
  }
}

/** A stale worker must fail its poll instead of reporting another worker's work. */
export class UberWebhookLeaseLostError extends Error {
  constructor(
    readonly eventId: string,
    readonly operation: string,
  ) {
    super(`Uber webhook lease lost during ${operation} (${eventId})`);
    this.name = 'UberWebhookLeaseLostError';
=======
  private extractOrdering(payload: unknown) {
    const root = this.asObject(payload);
    const meta = this.asObject(root?.meta);
    const timestamp = this.readString(
      root?.event_time,
      root?.event_timestamp,
      root?.occurred_at,
      root?.created_at,
      meta?.event_time,
    );
    const occurredAt = timestamp ? new Date(timestamp) : null;
    const sequenceValue =
      root?.sequence ?? root?.sequence_number ?? meta?.sequence;
    const sequence =
      typeof sequenceValue === 'number' && Number.isSafeInteger(sequenceValue)
        ? sequenceValue
        : typeof sequenceValue === 'string' && /^\d+$/.test(sequenceValue)
          ? Number(sequenceValue)
          : null;
    return {
      occurredAt:
        occurredAt && !Number.isNaN(occurredAt.getTime()) ? occurredAt : null,
      resourceVersion: this.readString(
        root?.resource_version,
        root?.version,
        meta?.resource_version,
      ),
      sequence:
        sequence !== null && Number.isSafeInteger(sequence) ? sequence : null,
    };
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
>>>>>>> origin/main
  }
}
