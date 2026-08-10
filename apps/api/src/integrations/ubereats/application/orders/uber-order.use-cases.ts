import { Inject, Injectable } from '@nestjs/common';
import type { OrderStatus } from '@prisma/client';
import type { UberOrderNotificationEventV1 } from '../../contracts/events/uber-order-notification.v1';
import {
  UBER_ORDER_ACTION_PORT,
  UBER_ORDER_IMPORT_PORT,
  UBER_ORDER_SYNC_PORT,
  type UberOrderActionPort,
  type UberOrderImportPort,
  type UberOrderSyncPort,
} from '../ports/uber-use-case.ports';

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
  ) {
    return this.orders.processWebhookEvent(eventType, eventId, payload);
  }
}
/** Cancellation is an event-idempotent order import with its own transaction boundary. */
@Injectable()
export class CancelUberOrderUseCase extends ImportUberOrderUseCase {}
/** Atomically creates an action intent; externalOrderId + action is the idempotency key. */
@Injectable()
export class RequestUberOrderActionUseCase {
  constructor(
    @Inject(UBER_ORDER_ACTION_PORT)
    private readonly actions: UberOrderActionPort,
  ) {}
  accept(id: string) {
    return this.actions.acceptUberOrder(id);
  }
  deny(id: string, reasonCode: string, reasonDetail?: string) {
    return this.actions.denyUberOrder(id, reasonCode, reasonDetail);
  }
  retryReadyForPickup(id: string) {
    return this.actions.retryReadyForPickup(id);
  }
  getReadyForPickupAction(id: string) {
    return this.actions.getReadyForPickupAction(id);
  }
}
/** Claims durable action leases and records each gateway result in a separate transaction. */
@Injectable()
export class ExecuteUberOrderActionWorker {
  constructor(
    @Inject(UBER_ORDER_ACTION_PORT)
    private readonly actions: UberOrderActionPort,
  ) {}
  execute(limit = 50) {
    return this.actions.processPendingUberOrderActions(limit);
  }
}
/** Synchronizes one state transition, keyed by externalOrderId + target status. */
@Injectable()
export class SyncUberOrderStatusUseCase {
  constructor(
    @Inject(UBER_ORDER_SYNC_PORT) private readonly orders: UberOrderSyncPort,
  ) {}
  execute(id: string, status: OrderStatus) {
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
