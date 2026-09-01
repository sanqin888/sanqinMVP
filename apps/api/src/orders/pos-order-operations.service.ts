import { Injectable } from '@nestjs/common';
import { OrderPreparationService } from './order-preparation.service';
import { OrderSchedulingQueryService } from './order-scheduling-query.service';
import { OrdersService } from './orders.service';
import type {
  PosOrderAmendmentInput,
  PosOrderBoardQuery,
  PosOrderFullRefundInput,
  PosOrderOperationsPort,
} from './pos-order-operations.contract';

@Injectable()
export class PosOrderOperationsService implements PosOrderOperationsPort {
  constructor(
    private readonly orders: OrdersService,
    private readonly scheduling: OrderSchedulingQueryService,
    private readonly preparation: OrderPreparationService,
  ) {}

  createForStore(...args: Parameters<OrdersService['createForStore']>) {
    return this.orders.createForStore(...args);
  }

  recent(storeStableId: string, limit?: number) {
    return this.orders.recent(storeStableId, limit);
  }

  board(storeStableId: string, query: PosOrderBoardQuery) {
    return this.orders.board(storeStableId, query);
  }

  getByStableIdForStore(orderStableId: string, storeStableId: string) {
    return this.orders.getByStableIdForStore(orderStableId, storeStableId);
  }

  updateStatusForStore(
    orderStableId: string,
    storeStableId: string,
    status: Parameters<OrdersService['updateStatusForStore']>[2],
  ) {
    return this.orders.updateStatusForStore(
      orderStableId,
      storeStableId,
      status,
    );
  }

  advanceForStore(orderStableId: string, storeStableId: string) {
    return this.orders.advanceForStore(orderStableId, storeStableId);
  }

  getExternalPaymentCents(orderStableId: string) {
    return this.orders.getExternalPaymentCents(orderStableId);
  }

  createAmendment(input: PosOrderAmendmentInput) {
    return this.orders.createAmendment(input);
  }

  createFullRefund(input: PosOrderFullRefundInput) {
    return this.orders.createFullRefund(input);
  }

  listUpcomingScheduledForStore(storeStableId: string) {
    return this.scheduling.listUpcomingForStoreStableId(storeStableId);
  }

  getFulfillmentTimingForStore(
    orderStableId: string,
    storeStableId: string,
  ) {
    return this.scheduling.findByStableIdForStore(
      orderStableId,
      storeStableId,
    );
  }

  getFulfillmentTimingsForStore(
    orderStableIds: string[],
    storeStableId: string,
  ) {
    return this.scheduling.findTimingsByStableIdsForStore(
      orderStableIds,
      storeStableId,
    );
  }

  async activateScheduledPreparation(
    orderStableId: string,
    storeStableId: string,
  ): Promise<void> {
    await this.preparation.activateScheduledOrderByStableId(
      orderStableId,
      storeStableId,
    );
  }
}
