import { Injectable } from '@nestjs/common';

import type {
  OrderFinancialChangeFactV1,
  OrderFinancialChangeFactsRangeV1,
  OrderFinancialChangeFactsReaderPort,
} from './order-financial-change-facts-reader.contract';
import {
  ORDER_FINANCIAL_ADJUSTMENT_FACT_EVENT,
  ORDER_FINANCIAL_CHANGE_FACT_SOURCE,
  ORDER_FINANCIAL_REVERSAL_FACT_EVENT,
  parseOrderFinancialChangeFactV1,
} from './order-financial-change-fact';
import { PrismaService } from './orders-prisma';

@Injectable()
export class OrderFinancialChangeFactsReaderService implements OrderFinancialChangeFactsReaderPort {
  constructor(private readonly prisma: PrismaService) {}

  async readFactByStableId(
    factStableId: string,
  ): Promise<OrderFinancialChangeFactV1 | null> {
    const stableId = factStableId.trim();
    if (!stableId) return null;
    const row = await this.prisma.opsEvent.findFirst({
      where: {
        source: ORDER_FINANCIAL_CHANGE_FACT_SOURCE,
        eventName: {
          in: [
            ORDER_FINANCIAL_ADJUSTMENT_FACT_EVENT,
            ORDER_FINANCIAL_REVERSAL_FACT_EVENT,
          ],
        },
        payload: { path: ['factStableId'], equals: stableId },
      },
      select: { payload: true },
    });
    if (!row) return null;
    const fact = parseOrderFinancialChangeFactV1(row.payload);
    if (!fact || fact.factStableId !== stableId) {
      throw new Error(
        `Malformed immutable Order financial change fact: ${stableId}`,
      );
    }
    return fact;
  }

  async readFactsByOrderStableId(
    orderStableId: string,
  ): Promise<OrderFinancialChangeFactV1[]> {
    const stableId = orderStableId.trim();
    if (!stableId) return [];
    const rows = await this.prisma.opsEvent.findMany({
      where: {
        source: ORDER_FINANCIAL_CHANGE_FACT_SOURCE,
        eventName: {
          in: [
            ORDER_FINANCIAL_ADJUSTMENT_FACT_EVENT,
            ORDER_FINANCIAL_REVERSAL_FACT_EVENT,
          ],
        },
        payload: { path: ['orderStableId'], equals: stableId },
      },
      select: { payload: true },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(({ payload }) => this.parseOrThrow(payload));
  }

  async readFactsByOrderStableIds(
    orderStableIds: string[],
  ): Promise<OrderFinancialChangeFactV1[]> {
    const stableIds = [
      ...new Set(orderStableIds.map((value) => value.trim()).filter(Boolean)),
    ].sort();
    if (stableIds.length === 0) return [];

    const rows = await this.prisma.opsEvent.findMany({
      where: {
        source: ORDER_FINANCIAL_CHANGE_FACT_SOURCE,
        eventName: {
          in: [
            ORDER_FINANCIAL_ADJUSTMENT_FACT_EVENT,
            ORDER_FINANCIAL_REVERSAL_FACT_EVENT,
          ],
        },
        OR: stableIds.map((orderStableId) => ({
          payload: { path: ['orderStableId'], equals: orderStableId },
        })),
      },
      select: { payload: true },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
    const requested = new Set(stableIds);
    return rows
      .map(({ payload }) => this.parseOrThrow(payload))
      .filter((fact) => requested.has(fact.orderStableId));
  }

  async readFactsForRange(
    range: OrderFinancialChangeFactsRangeV1,
  ): Promise<OrderFinancialChangeFactV1[]> {
    if (range.toExclusive <= range.fromInclusive) {
      throw new Error('toExclusive must be after fromInclusive');
    }
    const storeStableId = range.storeStableId?.trim();
    const rows = await this.prisma.opsEvent.findMany({
      where: {
        source: ORDER_FINANCIAL_CHANGE_FACT_SOURCE,
        eventName: {
          in: [
            ORDER_FINANCIAL_ADJUSTMENT_FACT_EVENT,
            ORDER_FINANCIAL_REVERSAL_FACT_EVENT,
          ],
        },
        occurredAt: {
          gte: range.fromInclusive,
          lt: range.toExclusive,
        },
        ...(storeStableId
          ? { payload: { path: ['storeStableId'], equals: storeStableId } }
          : {}),
      },
      select: { payload: true },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(({ payload }) => this.parseOrThrow(payload));
  }

  private parseOrThrow(payload: unknown): OrderFinancialChangeFactV1 {
    const fact = parseOrderFinancialChangeFactV1(payload);
    if (!fact)
      throw new Error('Malformed immutable Order financial change fact');
    return fact;
  }
}
