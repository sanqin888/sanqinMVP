import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

import { readOrderItemComponentsSnapshot } from './order-item-components';
import type {
  OrderReportingFactsReaderPort,
  OrderReportingItemFactV1,
  OrderReportingMetricsV1,
} from './order-reporting-facts-reader.contract';
import { PrismaService } from './orders-prisma';

const REPORTABLE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.paid,
  OrderStatus.making,
  OrderStatus.ready,
  OrderStatus.completed,
];

@Injectable()
export class OrderReportingFactsReaderService implements OrderReportingFactsReaderPort {
  constructor(private readonly prisma: PrismaService) {}

  async readMetricsForRange(
    startDate: Date,
    endDate: Date,
  ): Promise<OrderReportingMetricsV1> {
    const where = {
      createdAt: { gte: startDate, lte: endDate },
      status: { in: REPORTABLE_ORDER_STATUSES },
    };

    const aggregations = await this.prisma.order.aggregate({
      where,
      _sum: {
        totalCents: true,
        subtotalCents: true,
        taxCents: true,
        deliveryFeeCents: true,
      },
      _count: { id: true },
    });

    const byPaymentMethod = await this.prisma.order.groupBy({
      by: ['paymentMethod'],
      where,
      _sum: { totalCents: true },
      _count: { id: true },
    });

    const byFulfillment = await this.prisma.order.groupBy({
      by: ['fulfillmentType'],
      where,
      _sum: { totalCents: true },
      _count: { id: true },
    });

    const timeline = await this.prisma.order.findMany({
      where,
      select: {
        createdAt: true,
        totalCents: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      totalCents: aggregations._sum.totalCents ?? 0,
      subtotalCents: aggregations._sum.subtotalCents ?? 0,
      taxCents: aggregations._sum.taxCents ?? 0,
      deliveryFeeCents: aggregations._sum.deliveryFeeCents ?? 0,
      orderCount: aggregations._count.id ?? 0,
      payment: byPaymentMethod.map((entry) => ({
        name: entry.paymentMethod,
        totalCents: entry._sum.totalCents ?? 0,
      })),
      fulfillment: byFulfillment.map((entry) => ({
        name: entry.fulfillmentType,
        totalCents: entry._sum.totalCents ?? 0,
      })),
      timeline,
    };
  }

  async readItemsForRange(
    startDate: Date,
    endDate: Date,
  ): Promise<OrderReportingItemFactV1[]> {
    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        order: {
          createdAt: { gte: startDate, lte: endDate },
          status: { in: REPORTABLE_ORDER_STATUSES },
        },
      },
      select: {
        qty: true,
        productStableId: true,
        displayName: true,
        nameEn: true,
        nameZh: true,
        componentsJson: true,
      },
    });

    return orderItems.map((item) => ({
      qty: item.qty,
      productStableId: item.productStableId,
      displayName: item.displayName,
      nameEn: item.nameEn,
      nameZh: item.nameZh,
      components: readOrderItemComponentsSnapshot(item.componentsJson).map(
        (component) => ({
          productStableId: component.productStableId,
          nameEn: component.nameEn,
          nameZh: component.nameZh,
          quantityPerParent: component.quantityPerParent,
        }),
      ),
    }));
  }
}
