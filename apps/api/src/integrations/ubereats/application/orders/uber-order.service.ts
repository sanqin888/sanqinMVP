import { Injectable } from '@nestjs/common';
import {
  ExecuteUberOrderActionWorker,
  ImportUberOrderUseCase,
  ListPendingUberOrdersQuery,
  RequestUberOrderActionUseCase,
  SyncUberOrderStatusUseCase,
} from './uber-order.use-cases';
/** Thin transport facade retained for controller compatibility; it owns no business transaction. */
@Injectable()
export class UberOrderApplication {
  constructor(
    private readonly importer: ImportUberOrderUseCase,
    private readonly actions: RequestUberOrderActionUseCase,
    private readonly actionWorker: ExecuteUberOrderActionWorker,
    private readonly statusSync: SyncUberOrderStatusUseCase,
    private readonly pending: ListPendingUberOrdersQuery,
  ) {}
  syncOrderStatusToUber(
    ...a: Parameters<SyncUberOrderStatusUseCase['execute']>
  ) {
    return this.statusSync.execute(...a);
  }
  listPendingUberOrders() {
    return this.pending.list();
  }
  getPendingUberOrdersSummary() {
    return this.pending.summary();
  }
  processWebhookEvent(...a: Parameters<ImportUberOrderUseCase['execute']>) {
    return this.importer.execute(...a);
  }
  acceptUberOrder(...a: Parameters<RequestUberOrderActionUseCase['accept']>) {
    return this.actions.accept(...a);
  }
  denyUberOrder(...a: Parameters<RequestUberOrderActionUseCase['deny']>) {
    return this.actions.deny(...a);
  }
  retryReadyForPickup(
    ...a: Parameters<RequestUberOrderActionUseCase['retryReadyForPickup']>
  ) {
    return this.actions.retryReadyForPickup(...a);
  }
  getReadyForPickupAction(
    ...a: Parameters<RequestUberOrderActionUseCase['getReadyForPickupAction']>
  ) {
    return this.actions.getReadyForPickupAction(...a);
  }
  processPendingUberOrderActions(
    ...a: Parameters<ExecuteUberOrderActionWorker['execute']>
  ) {
    return this.actionWorker.execute(...a);
  }
}
