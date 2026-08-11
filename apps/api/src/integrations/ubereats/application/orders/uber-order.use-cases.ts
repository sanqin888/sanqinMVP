import { Inject, Injectable } from '@nestjs/common';
import type { UberOrderStatus } from '../../domain/orders/uber-order.types';
import type { UberOrderNotificationEventV1 } from '../../contracts/events/uber-order-notification.v1';
import type { UberEventOrdering } from '../ports/uber-order-processing.ports';
import {
  UBER_ORDER_IMPORT_PORT,
  UBER_ORDER_SYNC_PORT,
  type UberOrderImportPort,
  type UberOrderSyncPort,
} from '../ports/uber-use-case.ports';
import { UberOrderActionService } from './uber-order-action.service';

/** Imports an event once, keyed by the Uber event id; the adapter owns its graph transaction. */
@Injectable()
export class ImportUberOrderUseCase {
  constructor(
    @Inject(UBER_ORDER_IMPORT_PORT)
    private readonly orders: UberOrderImportPort,
  ) {}
  execute(
    eventType: string,
    eventId: string,
    payload: UberOrderNotificationEventV1,
    ordering?: UberEventOrdering,
  ) {
    return this.orders.processWebhookEvent(
      eventType,
      eventId,
      payload,
      ordering,
    );
  }
}
/** Cancellation is an event-idempotent order import with its own transaction boundary. */
@Injectable()
export class CancelUberOrderUseCase extends ImportUberOrderUseCase {}
/** Atomically creates an action intent; externalOrderId + action is the idempotency key. */
@Injectable()
export class RequestUberOrderActionUseCase {
  constructor(private readonly actions: UberOrderActionService) {}
  async accept(id: string) {
    return this.present(await this.actions.request(id, 'ACCEPT'));
  }
  async deny(id: string, reasonCode: string, reasonDetail?: string) {
    return this.present(
      await this.actions.request(id, 'DENY', {
        reasonCode,
        reasonDetail: reasonDetail ?? null,
      }),
    );
  }
  async retryReadyForPickup(id: string) {
    return this.present(await this.actions.request(id, 'READY_FOR_PICKUP'));
  }
  async getReadyForPickupAction(id: string) {
    return this.present(await this.actions.request(id, 'READY_FOR_PICKUP'));
  }
  private present(intent: { taskId: string; created: boolean }) {
    return {
      ok: false,
      id: intent.taskId,
      actionId: intent.taskId,
      status: 'PENDING' as const,
      retryable: true,
      duplicate: !intent.created,
      lastError: null,
    };
  }
}
/** Claims durable action leases and records each gateway result in a separate transaction. */
@Injectable()
export class ExecuteUberOrderActionWorker {
  constructor(private readonly actions: UberOrderActionService) {}
  execute(limit = 50) {
    return this.actions.process(limit, `worker-${process.pid}`);
  }
}
/** Synchronizes one state transition, keyed by externalOrderId + target status. */
@Injectable()
export class SyncUberOrderStatusUseCase {
  constructor(
    @Inject(UBER_ORDER_SYNC_PORT) private readonly orders: UberOrderSyncPort,
  ) {}
  execute(id: string, status: UberOrderStatus) {
    return this.orders.syncOrderStatusToUber(id, status);
  }
}
/** Read-only pending-order query; it never starts a transaction. */
@Injectable()
export class ListPendingUberOrdersQuery {
  constructor(
    @Inject(UBER_ORDER_SYNC_PORT) private readonly orders: UberOrderSyncPort,
  ) {}
  list() {
    return this.orders.listPendingUberOrders();
  }
  summary() {
    return this.orders.getPendingUberOrdersSummary();
  }
}
