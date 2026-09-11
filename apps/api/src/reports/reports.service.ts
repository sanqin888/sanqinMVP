import { Inject, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';

import {
  REPORTING_ORDER_FACTS_QUERY,
  type ReportingOrderFactsQueryPort,
  type ReportingOrderItemFactV1,
} from './reporting-order-facts-query.contract';
import type {
  ReportingTopItemAggregate,
  ReportingTopItemsQueryPort,
} from './reporting-top-items-query.contract';

interface ReportQueryDto {
  from?: string;
  to?: string;
}

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

  async getReport(query: ReportQueryDto) {
    // Preserve the existing report timezone contract for this slice.
    const zone = process.env.TZ || 'America/Toronto';
    const now = DateTime.now().setZone(zone);

    const startDt = query.from
      ? DateTime.fromISO(query.from, { zone }).startOf('day')
      : now.startOf('day');

    const endDt = query.to
      ? DateTime.fromISO(query.to, { zone }).endOf('day')
      : now.endOf('day');

    const startDate = startDt.toJSDate();
    const endDate = endDt.toJSDate();

    const metrics = await this.orderFacts.readMetricsForRange(
      startDate,
      endDate,
    );

    const diffDays = endDt.diff(startDt, 'days').days;
    const isSingleDay = diffDays <= 1.1;
    const chartDataMap = new Map<string, number>();

    metrics.timeline.forEach((order) => {
      const dt = DateTime.fromJSDate(order.createdAt).setZone(zone);
      const key = isSingleDay
        ? dt.toFormat('HH:00')
        : dt.toFormat('yyyy-MM-dd');
      const current = chartDataMap.get(key) || 0;
      chartDataMap.set(key, current + order.totalCents);
    });

    const chartData = Array.from(chartDataMap.entries())
      .map(([date, cents]) => ({
        date,
        total: cents / 100,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const topItems = (await this.getTopItemsForRange(startDate, endDate)).slice(
      0,
      10,
    );

    const averageOrderValueCents =
      metrics.orderCount > 0
        ? Math.round(metrics.totalCents / metrics.orderCount)
        : 0;

    return {
      summary: {
        totalSales: metrics.totalCents / 100,
        subtotal: metrics.subtotalCents / 100,
        tax: metrics.taxCents / 100,
        deliveryFees: metrics.deliveryFeeCents / 100,
        orderCount: metrics.orderCount,
        averageOrderValue: averageOrderValueCents / 100,
      },
      chartData,
      breakdown: {
        payment: metrics.payment.map((entry) => ({
          name: entry.name,
          value: entry.totalCents / 100,
        })),
        fulfillment: metrics.fulfillment.map((entry) => ({
          name: entry.name,
          value: entry.totalCents / 100,
        })),
      },
      topItems: topItems.map(({ name, quantity }) => ({ name, quantity })),
    };
  }
}
