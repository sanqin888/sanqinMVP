import { Inject, Injectable } from '@nestjs/common';

import {
  REPORTING_ORDER_FACTS_QUERY,
  type ReportingOrderFactsQueryPort,
  type ReportingOrderItemFactV1,
} from './reporting-order-facts-query.contract';
import type {
  ReportingTopItemAggregate,
  ReportingTopItemsQueryPort,
} from './reporting-top-items-query.contract';

@Injectable()
export class ReportsService implements ReportingTopItemsQueryPort {
  constructor(
    @Inject(REPORTING_ORDER_FACTS_QUERY)
    private readonly orderFacts: ReportingOrderFactsQueryPort,
  ) {}

  private buildTopItems(orderItems: ReportingOrderItemFactV1[]) {
    const aggregate = new Map<string, ReportingTopItemAggregate>();
    const addItem = (key: string, name: string, quantity: number) => {
      const current = aggregate.get(key);
      aggregate.set(key, {
        stableId: key,
        name: current?.name ?? name,
        quantity: (current?.quantity ?? 0) + quantity,
      });
    };

    for (const orderItem of orderItems) {
      if (orderItem.components.length > 0) {
        for (const component of orderItem.components) {
          addItem(
            component.productStableId,
            component.nameZh || component.nameEn || component.productStableId,
            orderItem.qty * component.quantityPerParent,
          );
        }
        continue;
      }

      addItem(
        orderItem.productStableId,
        this.resolveItemName(orderItem),
        orderItem.qty,
      );
    }

    return Array.from(aggregate.values()).sort(
      (a, b) => b.quantity - a.quantity,
    );
  }

  private resolveItemName(
    item: Pick<
      ReportingOrderItemFactV1,
      'productStableId' | 'displayName' | 'nameEn' | 'nameZh'
    >,
  ) {
    return (
      item.displayName ||
      item.nameZh ||
      item.nameEn ||
      item.productStableId ||
      '未知商品'
    );
  }

  async getTopItemsForRange(
    startDate: Date,
    endDate: Date,
  ): Promise<ReportingTopItemAggregate[]> {
    const orderItems = await this.orderFacts.readItemsForRange(
      startDate,
      endDate,
    );
    return this.buildTopItems(orderItems);
  }
}
