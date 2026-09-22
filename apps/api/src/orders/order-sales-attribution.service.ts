import { Injectable } from '@nestjs/common';
import { Channel, PaymentMethod } from '@prisma/client';

import type {
  OrderSalesAttributionChannelV1,
  OrderSalesAttributionPrimaryPaymentMethodV1,
  OrderSalesAttributionReaderPort,
  OrderSalesAttributionV1,
} from './order-sales-attribution.contract';
import {
  ORDER_FINANCIAL_ADJUSTMENT_FACT_EVENT,
  ORDER_FINANCIAL_CHANGE_FACT_SOURCE,
  ORDER_FINANCIAL_REVERSAL_FACT_EVENT,
  parseOrderFinancialChangeFactV1,
} from './order-financial-change-fact';
import {
  ORDER_FINANCIAL_SALE_FACT_EVENT,
  ORDER_FINANCIAL_SALE_FACT_SOURCE,
  orderFinancialSaleFactIdempotencyKey,
  parseOrderFinancialFactV1,
} from './order-financial-sale-fact';
import { PrismaService } from './orders-prisma';

const toChannel = (channel: Channel): OrderSalesAttributionChannelV1 => {
  switch (channel) {
    case Channel.web:
      return 'web';
    case Channel.in_store:
      return 'in_store';
    case Channel.ubereats:
      return 'ubereats';
    default:
      throw new Error(
        `Unsupported Order sales attribution channel: ${String(channel)}`,
      );
  }
};

const toPrimaryPaymentMethod = (
  paymentMethod: PaymentMethod,
): OrderSalesAttributionPrimaryPaymentMethodV1 => {
  switch (paymentMethod) {
    case PaymentMethod.CASH:
      return 'CASH';
    case PaymentMethod.CARD:
      return 'CARD';
    case PaymentMethod.WECHAT_ALIPAY:
      return 'WECHAT_ALIPAY';
    case PaymentMethod.STORE_BALANCE:
      return 'STORE_BALANCE';
    case PaymentMethod.UBEREATS:
      return 'UBEREATS';
    default:
      throw new Error(
        `Unsupported Order sales attribution payment method: ${String(paymentMethod)}`,
      );
  }
};

const immutableSaleAttribution = (
  payload: unknown,
): OrderSalesAttributionV1 => {
  const fact = parseOrderFinancialFactV1(payload);
  if (!fact) {
    throw new Error('Malformed immutable Order financial fact for attribution');
  }
  if (fact.factStableId !== fact.orderStableId) {
    throw new Error(
      `Immutable Order sales attribution fact/order identity mismatch: ${fact.factStableId}`,
    );
  }
  return {
    version: 1,
    sourceFactStableId: fact.factStableId,
    orderStableId: fact.orderStableId,
    storeStableId: fact.storeStableId,
    occurredAt: fact.occurredAt,
    channel: fact.channel,
    primaryPaymentMethod: fact.paymentMethod,
    sourceEvidence: 'IMMUTABLE_SALE_SNAPSHOT',
    primaryPaymentMethodEvidence: 'IMMUTABLE_SALE_SNAPSHOT',
  };
};

@Injectable()
export class OrderSalesAttributionReaderService
  implements OrderSalesAttributionReaderPort
{
  constructor(private readonly prisma: PrismaService) {}

  async readBySourceFactStableIds(
    sourceFactStableIds: string[],
  ): Promise<OrderSalesAttributionV1[]> {
    const stableIds = this.normalizeStableIds(sourceFactStableIds);
    if (stableIds.length === 0) return [];

    const attributionBySourceFactStableId =
      await this.readImmutableSaleAttributions(stableIds);

    const unresolvedSourceFactStableIds = stableIds.filter(
      (stableId) => !attributionBySourceFactStableId.has(stableId),
    );
    const changeSourceFactStableIds = new Set<string>();
    if (unresolvedSourceFactStableIds.length > 0) {
      const changes = await this.readImmutableChanges(
        unresolvedSourceFactStableIds,
      );
      changes.forEach((change) =>
        changeSourceFactStableIds.add(change.factStableId),
      );
      const originalSaleAttributionByOrderStableId =
        await this.readSaleAttributionsByOrderStableIds(
          changes.map((change) => change.orderStableId),
        );

      for (const change of changes) {
        const originalSale = originalSaleAttributionByOrderStableId.get(
          change.orderStableId,
        );
        if (!originalSale) continue;
        attributionBySourceFactStableId.set(change.factStableId, {
          version: 1,
          sourceFactStableId: change.factStableId,
          orderStableId: change.orderStableId,
          storeStableId: change.storeStableId,
          occurredAt: change.occurredAt,
          channel: change.channel,
          primaryPaymentMethod: originalSale.primaryPaymentMethod,
          sourceEvidence: 'IMMUTABLE_CHANGE_SNAPSHOT',
          primaryPaymentMethodEvidence:
            originalSale.primaryPaymentMethodEvidence,
        });
      }
    }

    const unresolvedLegacySaleIds = stableIds.filter(
      (stableId) =>
        !attributionBySourceFactStableId.has(stableId) &&
        !changeSourceFactStableIds.has(stableId),
    );
    if (unresolvedLegacySaleIds.length > 0) {
      const legacySales = await this.readLegacySaleAttributions(
        unresolvedLegacySaleIds,
      );
      for (const [orderStableId, attribution] of legacySales) {
        attributionBySourceFactStableId.set(orderStableId, attribution);
      }
    }

    return stableIds.flatMap((stableId) => {
      const attribution = attributionBySourceFactStableId.get(stableId);
      return attribution ? [attribution] : [];
    });
  }

  private normalizeStableIds(values: string[]): string[] {
    return Array.from(
      new Set(
        values
          .map((stableId) => stableId.trim())
          .filter((stableId) => stableId.length > 0),
      ),
    );
  }

  private async readImmutableSaleAttributions(
    orderStableIds: string[],
  ): Promise<Map<string, OrderSalesAttributionV1>> {
    const stableIds = this.normalizeStableIds(orderStableIds);
    const result = new Map<string, OrderSalesAttributionV1>();
    if (stableIds.length === 0) return result;

    const rows = await this.prisma.opsEvent.findMany({
      where: {
        source: ORDER_FINANCIAL_SALE_FACT_SOURCE,
        eventName: ORDER_FINANCIAL_SALE_FACT_EVENT,
        idempotencyKey: {
          in: stableIds.map(orderFinancialSaleFactIdempotencyKey),
        },
      },
      select: { payload: true },
    });

    const requested = new Set(stableIds);
    for (const row of rows) {
      const attribution = immutableSaleAttribution(row.payload);
      if (!requested.has(attribution.sourceFactStableId)) {
        throw new Error(
          `Immutable Order sales attribution identity mismatch: ${attribution.sourceFactStableId}`,
        );
      }
      result.set(attribution.orderStableId, attribution);
    }
    return result;
  }

  private async readLegacySaleAttributions(
    orderStableIds: string[],
  ): Promise<Map<string, OrderSalesAttributionV1>> {
    const stableIds = this.normalizeStableIds(orderStableIds);
    const result = new Map<string, OrderSalesAttributionV1>();
    if (stableIds.length === 0) return result;

    const rows = await this.prisma.order.findMany({
      where: { orderStableId: { in: stableIds } },
      select: {
        orderStableId: true,
        storeId: true,
        paidAt: true,
        channel: true,
        paymentMethod: true,
      },
    });
    for (const row of rows) {
      result.set(row.orderStableId, {
        version: 1,
        sourceFactStableId: row.orderStableId,
        orderStableId: row.orderStableId,
        storeStableId: row.storeId,
        occurredAt: row.paidAt,
        channel: toChannel(row.channel),
        primaryPaymentMethod: toPrimaryPaymentMethod(row.paymentMethod),
        sourceEvidence: 'LEGACY_CURRENT_ORDER',
        primaryPaymentMethodEvidence: 'LEGACY_CURRENT_ORDER',
      });
    }
    return result;
  }

  private async readSaleAttributionsByOrderStableIds(
    orderStableIds: string[],
  ): Promise<Map<string, OrderSalesAttributionV1>> {
    const stableIds = this.normalizeStableIds(orderStableIds);
    const immutable = await this.readImmutableSaleAttributions(stableIds);
    const missingIds = stableIds.filter(
      (stableId) => !immutable.has(stableId),
    );
    if (missingIds.length === 0) return immutable;

    const legacy = await this.readLegacySaleAttributions(missingIds);
    for (const [orderStableId, attribution] of legacy) {
      immutable.set(orderStableId, attribution);
    }
    return immutable;
  }

  private async readImmutableChanges(sourceFactStableIds: string[]) {
    const stableIds = this.normalizeStableIds(sourceFactStableIds);
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
        OR: stableIds.map((factStableId) => ({
          payload: { path: ['factStableId'], equals: factStableId },
        })),
      },
      select: { payload: true },
    });

    const requested = new Set(stableIds);
    return rows.map(({ payload }) => {
      const fact = parseOrderFinancialChangeFactV1(payload);
      if (!fact) {
        throw new Error(
          'Malformed immutable Order financial change fact for attribution',
        );
      }
      if (!requested.has(fact.factStableId)) {
        throw new Error(
          `Immutable Order change attribution identity mismatch: ${fact.factStableId}`,
        );
      }
      return fact;
    });
  }
}
