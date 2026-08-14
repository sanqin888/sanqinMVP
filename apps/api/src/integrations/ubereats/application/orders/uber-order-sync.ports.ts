import type { UberOrderStatus } from '../../domain/orders/uber-order.types';

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

export const UBER_ORDER_SYNC_REPOSITORY = Symbol('UBER_ORDER_SYNC_REPOSITORY');
