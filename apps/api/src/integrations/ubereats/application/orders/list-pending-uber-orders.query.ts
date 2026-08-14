import type {
  UberOrderSyncRepositoryPort,
  UberPendingOrder,
} from './uber-order-sync.ports';

export type PendingUberOrdersResult = {
  count: number;
  items: UberPendingOrder[];
};

export type PendingUberOrdersSummary = {
  count: number;
  updatedAt: Date | null;
};

/** Read-only pending order views; no transaction or persistence vocabulary leaks out. */
export class ListPendingUberOrdersQuery {
  constructor(private readonly orders: UberOrderSyncRepositoryPort) {}
  async list(): Promise<PendingUberOrdersResult> {
    const items = await this.orders.listPending(100);
    return { count: items.length, items };
  }
  summary(): Promise<PendingUberOrdersSummary> {
    return this.orders.pendingSummary();
  }
}
