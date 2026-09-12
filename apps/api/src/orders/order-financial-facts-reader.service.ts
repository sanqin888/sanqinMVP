import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

import type {
  OrderFinancialFactV1,
  OrderFinancialFactsRangeV1,
  OrderFinancialFactsReaderPort,
} from './order-financial-facts-reader.contract';
import {
  buildOrderFinancialFactV1,
  ORDER_FINANCIAL_FACT_SELECT,
  ORDER_FINANCIAL_SALE_FACT_EVENT,
  ORDER_FINANCIAL_SALE_FACT_SOURCE,
  orderFinancialSaleFactIdempotencyKey,
  parseOrderFinancialFactV1,
} from './order-financial-sale-fact';
import { PrismaService } from './orders-prisma';

const FINANCIAL_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.paid,
  OrderStatus.making,
  OrderStatus.ready,
  OrderStatus.completed,
  OrderStatus.refunded,
];

@Injectable()
export class OrderFinancialFactsReaderService implements OrderFinancialFactsReaderPort {
  constructor(private readonly prisma: PrismaService) {}

  async readFactByOrderStableId(
    orderStableId: string,
  ): Promise<OrderFinancialFactV1 | null> {
    const stableId = orderStableId.trim();
    if (!stableId) return null;

    const durable = await this.prisma.opsEvent.findUnique({
      where: {
        idempotencyKey: orderFinancialSaleFactIdempotencyKey(stableId),
      },
      select: { payload: true },
    });
    if (durable) {
      const fact = parseOrderFinancialFactV1(durable.payload);
      if (!fact || fact.orderStableId !== stableId) {
        throw new Error(
          `Malformed immutable Order financial fact: ${stableId}`,
        );
      }
      return fact;
    }

    const row = await this.prisma.order.findFirst({
      where: {
        orderStableId: stableId,
        status: { in: FINANCIAL_ORDER_STATUSES },
      },
      select: ORDER_FINANCIAL_FACT_SELECT,
    });

    return row ? buildOrderFinancialFactV1(row, 'LEGACY_CURRENT_ORDER') : null;
  }

  async readFactsForRange(
    range: OrderFinancialFactsRangeV1,
  ): Promise<OrderFinancialFactV1[]> {
    if (range.toExclusive <= range.fromInclusive) {
      throw new Error('toExclusive must be after fromInclusive');
    }

    const storeStableId = range.storeStableId?.trim();
    const durableRows = await this.prisma.opsEvent.findMany({
      where: {
        source: ORDER_FINANCIAL_SALE_FACT_SOURCE,
        eventName: ORDER_FINANCIAL_SALE_FACT_EVENT,
        occurredAt: {
          gte: range.fromInclusive,
          lt: range.toExclusive,
        },
        ...(storeStableId
          ? {
              payload: {
                path: ['storeStableId'],
                equals: storeStableId,
              },
            }
          : {}),
      },
      select: { payload: true },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });

    const durableFacts = durableRows.map(({ payload }) => {
      const fact = parseOrderFinancialFactV1(payload);
      if (!fact) throw new Error('Malformed immutable Order financial fact');
      return fact;
    });
    const durableStableIds = durableFacts.map((fact) => fact.orderStableId);

    const legacyRows = await this.prisma.order.findMany({
      where: {
        paidAt: {
          gte: range.fromInclusive,
          lt: range.toExclusive,
        },
        status: { in: FINANCIAL_ORDER_STATUSES },
        ...(storeStableId ? { storeId: storeStableId } : {}),
        ...(durableStableIds.length > 0
          ? { orderStableId: { notIn: durableStableIds } }
          : {}),
      },
      select: ORDER_FINANCIAL_FACT_SELECT,
      orderBy: [{ paidAt: 'asc' }, { orderStableId: 'asc' }],
    });

    return [
      ...durableFacts,
      ...legacyRows.map((row) =>
        buildOrderFinancialFactV1(row, 'LEGACY_CURRENT_ORDER'),
      ),
    ].sort((left, right) => {
      const byOccurredAt =
        left.occurredAt.getTime() - right.occurredAt.getTime();
      return byOccurredAt !== 0
        ? byOccurredAt
        : left.orderStableId.localeCompare(right.orderStableId);
    });
  }
}
