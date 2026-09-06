import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderPreparationService } from './order-preparation.service';
import { OrderSchedulingQueryService } from './order-scheduling-query.service';
import { OrdersService } from './orders.service';
import { OrderLifecycleOutboxProcessor } from './processors/order-lifecycle-outbox.processor';
import type {
  PosOrderAmendmentInput,
  PosOrderBoardQuery,
  PosOrderFullRefundInput,
  PosOrderManagementQuery,
  PosOrderOperationsPort,
} from './pos-order-operations.contract';

@Injectable()
export class PosOrderOperationsService implements PosOrderOperationsPort {
  constructor(
    private readonly orders: OrdersService,
    private readonly scheduling: OrderSchedulingQueryService,
    private readonly preparation: OrderPreparationService,
    private readonly lifecycleOutbox: OrderLifecycleOutboxProcessor,
  ) {}

  async createForStore(...args: Parameters<OrdersService['createForStore']>) {
    const order = await this.orders.createForStore(...args);
    if (args[0].channel === 'in_store') {
      this.lifecycleOutbox.requestDrain();
    }
    return order;
  }

  quotePricingForStore(
    dto: Parameters<OrdersService['quoteOrderPricing']>[0],
    storeStableId: string,
  ) {
    if (!storeStableId.trim()) {
      throw new BadRequestException('storeStableId is required');
    }
    return this.orders.quoteOrderPricing(dto, { allowCustomUnitPrice: true });
  }

  recent(storeStableId: string, limit?: number) {
    return this.orders.recent(storeStableId, limit);
  }

  searchForStore(storeStableId: string, query: PosOrderManagementQuery) {
    return this.orders.searchForStore(storeStableId, query);
  }

  board(storeStableId: string, query: PosOrderBoardQuery) {
    return this.orders.board(storeStableId, query);
  }

  getByStableIdForStore(orderStableId: string, storeStableId: string) {
    return this.orders.getByStableIdForStore(orderStableId, storeStableId);
  }

  async updateStatusForStore(
    orderStableId: string,
    storeStableId: string,
    status: Parameters<OrdersService['updateStatusForStore']>[2],
  ) {
    if (status === 'making') {
      const current = await this.orders.getByStableIdForStore(
        orderStableId,
        storeStableId,
      );
      if (current.status === 'paid' && current.channel === 'web') {
        await this.acceptWebOrder(orderStableId, storeStableId);
        return this.orders.getByStableIdForStore(orderStableId, storeStableId);
      }
      if (current.status === 'paid' && current.channel === 'in_store') {
        await this.activateImmediatePreparation(orderStableId, storeStableId);
        return this.orders.getByStableIdForStore(orderStableId, storeStableId);
      }
    }

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

  getFulfillmentTimingForStore(orderStableId: string, storeStableId: string) {
    return this.scheduling.findByStableIdForStore(orderStableId, storeStableId);
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

  async acceptWebOrder(
    orderStableId: string,
    storeStableId: string,
  ): Promise<void> {
    const fulfillmentTiming = await this.preparation.acceptWebOrderByStableId(
      orderStableId,
      storeStableId,
    );
    if (fulfillmentTiming === 'IMMEDIATE') {
      await this.preparation.activateAcceptedImmediateOrderByStableId(
        orderStableId,
        storeStableId,
      );
      this.lifecycleOutbox.requestDrain();
    }
  }

  async activateImmediatePreparation(
    orderStableId: string,
    storeStableId: string,
  ): Promise<void> {
    await this.preparation.activateAcceptedImmediateOrderByStableId(
      orderStableId,
      storeStableId,
    );
    this.lifecycleOutbox.requestDrain();
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
