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
    private readonly inbox: UberWebhookInboxPort,
    private readonly orders: ImportUberOrderUseCase,
    private readonly menu: UberMenuNotificationHandler,
    private readonly merchant: HandleUberMerchantWebhookHandler,
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
      if (retryable)
        this.telemetry.workflowLog('error', 'webhook processing failed');
    }
  }

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
  }
}
