import { createHash } from 'crypto';
import { parseUberOrderNotificationV1 } from '../../contracts/events/uber-order-notification.v1';
import { parseUberMenuNotificationV1 } from '../../contracts/events/uber-menu-notification.v1';
import { parseUberOrderCancelV1 } from '../../contracts/events/uber-order-cancel.v1';
import { parseUberStoreProvisioningV1 } from '../../contracts/events/uber-store-provisioning.v1';
import { parseUberStoreStatusChangedV1 } from '../../contracts/events/uber-store-status.v1';
import { normalizeUberEventType } from '../../domain/shared/uber-integration.utils';
import { UberMenuNotificationHandler } from '../menu/uber-menu-notification.handler';
import { HandleUberMerchantWebhookHandler } from '../merchant/uber-merchant-webhook.handler';
import {
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
export class ProcessUberWebhookInboxUseCase {
  constructor(
    private readonly inbox: UberWebhookInboxPort,
    private readonly orders: ImportUberOrderUseCase,
    private readonly menu: UberMenuNotificationHandler,
    private readonly merchant: HandleUberMerchantWebhookHandler,
    private readonly telemetry: UberTelemetryPort,
  ) {}

  async execute(limit = 50): Promise<number> {
    const rows = await this.inbox.claimDue(limit);
    for (const row of rows) await this.route(row);
    return rows.length;
  }

  private async route(item: UberWebhookInboxItem): Promise<void> {
    const { eventId, eventType, payload } = item;
    try {
      switch (normalizeUberEventType(eventType)) {
        case 'orders.notification': {
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
        case 'orders.cancel': {
          const cancellation = parseUberOrderCancelV1(payload);
          if (!cancellation)
            throw new UberValidationError({
              code: 'UBER_ORDER_WEBHOOK_INVALID',
              message: 'Uber 订单取消 webhook envelope 无效',
              operation: 'webhook.route-order-cancel',
            });
          await this.orders.execute(
            eventType,
            eventId,
            cancellation,
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
          await this.menu.handle({
            resourceId: menu.resourceId,
            status: menu.status,
            failures: menu.failures,
          });
          break;
        }
        case 'store.provisioned':
        case 'store.deprovisioned': {
          if (!parseUberStoreProvisioningV1(payload))
            throw new UberValidationError({
              code: 'UBER_WEBHOOK_INVALID',
              message: 'Uber 门店 provisioning webhook envelope 无效',
              operation: 'webhook.route-store-provisioning',
            });
          await this.merchant.execute(eventType, eventId, payload);
          break;
        }
        case 'store.status.changed': {
          if (!parseUberStoreStatusChangedV1(payload))
            throw new UberValidationError({
              code: 'UBER_WEBHOOK_INVALID',
              message: 'Uber 门店状态 webhook envelope 无效',
              operation: 'webhook.route-store-status',
            });
          await this.quarantine(item, 'high');
          return;
        }
        default: {
          await this.quarantine(item, 'high');
          return;
        }
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

  private async quarantine(
    item: UberWebhookInboxItem,
    priority: 'high',
  ): Promise<void> {
    const safeSummary = this.safeEventSummary(item);
    await this.inbox.markUnsupported(item, {
      code: 'UBER_WEBHOOK_EVENT_UNSUPPORTED',
      eventType: item.eventType,
      safeSummary,
      businessVersion: item.businessVersion,
    });
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

  private safeEventSummary(item: UberWebhookInboxItem): string {
    const digest = createHash('sha256')
      .update(JSON.stringify(item.payload ?? null))
      .digest('hex')
      .slice(0, 16);
    return `type=${item.eventType};payloadSha256=${digest}`;
  }

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
  }
}
