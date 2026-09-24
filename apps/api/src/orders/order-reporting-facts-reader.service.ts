import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

import { readOrderItemComponentsSnapshot } from './order-item-components';
import type {
  OrderReportingFactsReaderPort,
  OrderReportingItemFactV1,
  OrderReportingOperationalItemFactV1,
  OrderReportingOperationalOrderFactV1,
  OrderReportingOperationalRangeV1,
  OrderReportingOperationalStatusV1,
} from './order-reporting-facts-reader.contract';
import { PrismaService } from './orders-prisma';

const REPORTABLE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.paid,
  OrderStatus.making,
  OrderStatus.ready,
  OrderStatus.completed,
];

function toOperationalStatus(
  status: OrderStatus,
): OrderReportingOperationalStatusV1 {
  switch (status) {
    case OrderStatus.paid:
    case OrderStatus.making:
    case OrderStatus.ready:
    case OrderStatus.completed:
      return status;
    default:
      throw new Error(`Unexpected non-reportable Order status: ${status}`);
  }
}

@Injectable()
export class OrderReportingFactsReaderService implements OrderReportingFactsReaderPort {
  constructor(private readonly prisma: PrismaService) {}

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

  async readOperationalOrdersForRange(
    query: OrderReportingOperationalRangeV1,
  ): Promise<OrderReportingOperationalOrderFactV1[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        storeId: query.storeStableId,
        createdAt: {
          gte: query.fromInclusive,
          lt: query.toExclusive,
        },
        status: { in: REPORTABLE_ORDER_STATUSES },
      },
      select: {
        orderStableId: true,
        status: true,
        createdAt: true,
        paidAt: true,
        makingAt: true,
        readyAt: true,
        totalCents: true,
        subtotalCents: true,
        taxCents: true,
        deliveryFeeCents: true,
        channel: true,
        paymentMethod: true,
        fulfillmentType: true,
      },
      orderBy: [{ createdAt: 'asc' }, { orderStableId: 'asc' }],
    });

    return rows.map((row) => ({
      orderStableId: row.orderStableId,
      storeStableId: query.storeStableId,
      status: toOperationalStatus(row.status),
      createdAt: row.createdAt,
      paidAt: row.paidAt,
      makingAt: row.makingAt,
      readyAt: row.readyAt,
      totalCents: row.totalCents,
      subtotalCents: row.subtotalCents,
      taxCents: row.taxCents,
      customerDeliveryFeeCents: row.deliveryFeeCents,
      channel: row.channel,
      primaryPaymentMethod: row.paymentMethod,
      fulfillmentType: row.fulfillmentType,
    }));
  }

  async readOperationalItemsForRange(
    query: OrderReportingOperationalRangeV1,
  ): Promise<OrderReportingOperationalItemFactV1[]> {
    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        order: {
          storeId: query.storeStableId,
          createdAt: {
            gte: query.fromInclusive,
            lt: query.toExclusive,
          },
          status: { in: REPORTABLE_ORDER_STATUSES },
        },
      },
      select: {
        qty: true,
        productStableId: true,
        displayName: true,
        nameEn: true,
        nameZh: true,
        unitPriceCents: true,
        isDailySpecialApplied: true,
        componentsJson: true,
        order: {
          select: {
            orderStableId: true,
            createdAt: true,
          },
        },
      },
    });

    return orderItems.map((item) => ({
      orderStableId: item.order.orderStableId,
      orderCreatedAt: item.order.createdAt,
      qty: item.qty,
      productStableId: item.productStableId,
      displayName: item.displayName,
      nameEn: item.nameEn,
      nameZh: item.nameZh,
      unitPriceCents: item.unitPriceCents,
      isDailySpecialApplied: item.isDailySpecialApplied,
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
