import type { UberOrderSyncRepositoryPort } from '../ports/uber-order-sync.ports';

/** Read-only pending order views; no transaction or persistence vocabulary leaks out. */
export class ListPendingUberOrdersQuery {
  constructor(private readonly orders: UberOrderSyncRepositoryPort) {}
  async list() {
    const items = await this.orders.listPending(100);
    return { count: items.length, items };
  }
  summary() {
    return this.orders.pendingSummary();
  }
}
