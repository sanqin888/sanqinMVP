import type {
  UberOrderActionName,
  UberOrderActionRecord,
  UberOrderStatus,
} from '../../domain/orders/uber-order.types';

export type UberPendingOrder = {
  orderStableId: string | null;
  externalOrderId: string | null;
  status: UberOrderStatus;
  totalCents: number;
  createdAt: Date;
};

export type UberOrderSyncTarget = {
  orderStableId: string | null;
  status: UberOrderStatus;
};

export interface UberOrderSyncRepositoryPort {
  findSyncTarget(externalOrderId: string): Promise<UberOrderSyncTarget | null>;
  listPending(limit: number): Promise<UberPendingOrder[]>;
  pendingSummary(): Promise<{ count: number; updatedAt: Date | null }>;
}

export interface UberOrderSyncUnitOfWorkPort {
  recordActionIntent(input: {
    externalOrderId: string;
    action: UberOrderActionName;
    idempotencyKey: string;
  }): Promise<void>;
}

export interface UberOrderActionQueuePort {
  enqueue(
    externalOrderId: string,
    action: UberOrderActionName,
  ): Promise<UberOrderActionRecord>;
}

export const UBER_ORDER_SYNC_REPOSITORY = Symbol('UBER_ORDER_SYNC_REPOSITORY');
export const UBER_ORDER_SYNC_UNIT_OF_WORK = Symbol(
  'UBER_ORDER_SYNC_UNIT_OF_WORK',
);
