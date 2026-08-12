import { createHash } from 'crypto';
import { dispatchUberWebhookV1 } from '../../domain/webhook/uber-webhook-event.parser';
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
          await this.menu.handle({
            resourceId: menu.resourceId,
            status: menu.status,
            failures: menu.failures,
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
}
