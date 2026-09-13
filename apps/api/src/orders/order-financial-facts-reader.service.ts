import { Inject, Injectable } from '@nestjs/common';
import { OrderStatus, type Prisma } from '@prisma/client';

import {
  CATALOG_ORDER_FACTS_READER,
  type CatalogOrderFactsReaderPort,
  type CatalogOrderItemMaterializationFact,
} from '../menu/public-api';
import type {
  OrderFinancialFactV1,
  OrderFinancialFactsRangeV1,
  OrderFinancialFactsReaderPort,
  OrderFinancialReplayCandidateV1,
  OrderFinancialReplayPricingResolutionV1,
} from './order-financial-facts-reader.contract';
import {
  hasCompatibleLegacyCatalogIdentity,
  resolveLegacyDailySpecialCatalogPricing,
} from './order-financial-replay';
import {
  buildOrderFinancialFactV1,
  ORDER_FINANCIAL_FACT_SELECT,
  ORDER_FINANCIAL_SALE_FACT_EVENT,
  ORDER_FINANCIAL_SALE_FACT_SOURCE,
  orderFinancialSaleFactIdempotencyKey,
  parseOrderFinancialFactV1,
  resolveOrderFinancialEffectiveBaseUnitCents,
} from './order-financial-sale-fact';
import { PrismaService } from './orders-prisma';

const FINANCIAL_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.paid,
  OrderStatus.making,
  OrderStatus.ready,
  OrderStatus.completed,
  OrderStatus.refunded,
];

const ORDER_FINANCIAL_REPLAY_SELECT = {
  id: true,
  ...ORDER_FINANCIAL_FACT_SELECT,
} satisfies Prisma.OrderSelect;

const ORDER_FINANCIAL_CATALOG_PRICE_EVIDENCE_SELECT = {
  productStableId: true,
  displayName: true,
  nameEn: true,
  nameZh: true,
  unitPriceCents: true,
  baseUnitPriceCents: true,
  optionsUnitPriceCents: true,
  order: {
    select: {
      status: true,
      promotionSnapshot: true,
    },
  },
} satisfies Prisma.OrderItemSelect;

type OrderFinancialReplaySnapshot = Prisma.OrderGetPayload<{
  select: typeof ORDER_FINANCIAL_REPLAY_SELECT;
}>;

type OrderFinancialSourceRecord =
  | {
      source: 'IMMUTABLE';
      fact: OrderFinancialFactV1;
    }
  | {
      source: 'LEGACY';
      fact: OrderFinancialFactV1;
      row: OrderFinancialReplaySnapshot;
    };

type LegacyOrderFinancialSourceRecord = Extract<
  OrderFinancialSourceRecord,
  { source: 'LEGACY' }
>;

const REVERSAL_ONLY_AMENDMENT_KINDS = new Set([
  'FULL_REFUND',
  'UBER_CANCELLATION',
  'EXTERNAL_CANCELLATION',
  'UBER_MANUAL_REFUND',
]);

const SALE_MUTATING_AMENDMENT_TYPES = new Set([
  'RETENDER',
  'VOID_ITEM',
  'SWAP_ITEM',
  'ADDITIONAL_CHARGE',
]);

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const isPostSaleMutation = (amendment: {
  type: string;
  summaryJson: unknown;
}): boolean => {
  const kind = asRecord(amendment.summaryJson)?.kind;
  if (typeof kind === 'string' && REVERSAL_ONLY_AMENDMENT_KINDS.has(kind)) {
    return false;
  }
  return SALE_MUTATING_AMENDMENT_TYPES.has(amendment.type);
};

@Injectable()
export class OrderFinancialFactsReaderService implements OrderFinancialFactsReaderPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CATALOG_ORDER_FACTS_READER)
    private readonly catalogOrderFacts: CatalogOrderFactsReaderPort,
  ) {}

  async readFactByOrderStableId(
    orderStableId: string,
  ): Promise<OrderFinancialFactV1 | null> {
    const record = await this.readSourceByOrderStableId(orderStableId);
    return record?.fact ?? null;
  }

  async readFactsForRange(
    range: OrderFinancialFactsRangeV1,
  ): Promise<OrderFinancialFactV1[]> {
    const records = await this.readSourceRecordsForRange(range);
    return records.map((record) => record.fact);
  }

  async readReplayCandidateByOrderStableId(
    orderStableId: string,
  ): Promise<OrderFinancialReplayCandidateV1 | null> {
    const record = await this.readSourceByOrderStableId(orderStableId);
    if (!record) return null;
    const [candidate] = await this.resolveReplayCandidates([record]);
    return candidate ?? null;
  }

  async readReplayCandidatesForRange(
    range: OrderFinancialFactsRangeV1,
  ): Promise<OrderFinancialReplayCandidateV1[]> {
    const records = await this.readSourceRecordsForRange(range);
    return this.resolveReplayCandidates(records);
  }

  private async readSourceByOrderStableId(
    orderStableId: string,
  ): Promise<OrderFinancialSourceRecord | null> {
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
      return { source: 'IMMUTABLE', fact };
    }

    const row = await this.prisma.order.findFirst({
      where: {
        orderStableId: stableId,
        status: { in: FINANCIAL_ORDER_STATUSES },
      },
      select: ORDER_FINANCIAL_REPLAY_SELECT,
    });
    if (!row) return null;
    return {
      source: 'LEGACY',
      row,
      fact: buildOrderFinancialFactV1(row, 'LEGACY_CURRENT_ORDER'),
    };
  }

  private async readSourceRecordsForRange(
    range: OrderFinancialFactsRangeV1,
  ): Promise<OrderFinancialSourceRecord[]> {
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

    const durableRecords: OrderFinancialSourceRecord[] = durableRows.map(
      ({ payload }) => {
        const fact = parseOrderFinancialFactV1(payload);
        if (!fact) throw new Error('Malformed immutable Order financial fact');
        return { source: 'IMMUTABLE', fact };
      },
    );
    const durableStableIds = durableRecords.map(
      (record) => record.fact.orderStableId,
    );

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
      select: ORDER_FINANCIAL_REPLAY_SELECT,
      orderBy: [{ paidAt: 'asc' }, { orderStableId: 'asc' }],
    });
    const legacyRecords: OrderFinancialSourceRecord[] = legacyRows.map(
      (row) => ({
        source: 'LEGACY',
        row,
        fact: buildOrderFinancialFactV1(row, 'LEGACY_CURRENT_ORDER'),
      }),
    );

    return [...durableRecords, ...legacyRecords].sort((left, right) => {
      const byOccurredAt =
        left.fact.occurredAt.getTime() - right.fact.occurredAt.getTime();
      return byOccurredAt !== 0
        ? byOccurredAt
        : left.fact.orderStableId.localeCompare(right.fact.orderStableId);
    });
  }

  private async resolveReplayCandidates(
    records: OrderFinancialSourceRecord[],
  ): Promise<OrderFinancialReplayCandidateV1[]> {
    const legacyRecords = records.filter(
      (record): record is LegacyOrderFinancialSourceRecord =>
        record.source === 'LEGACY',
    );
    const mutatedOrderDbIds = await this.findPostSaleMutationOrderDbIds(
      legacyRecords.map((record) => record.row.id),
    );

    const catalogStableIds = [
      ...new Set(
        legacyRecords.flatMap((record) =>
          mutatedOrderDbIds.has(record.row.id) ||
          record.fact.pricingEvidence === 'COMPLETE'
            ? []
            : record.row.items
                .filter(
                  (item) =>
                    item.isDailySpecialApplied && item.dailySpecialStableId,
                )
                .map((item) => item.productStableId),
        ),
      ),
    ];
    const catalogFacts = await this.readActiveCatalogFacts(catalogStableIds);
    const catalogPriceUnstableProductStableIds =
      await this.findCatalogPriceUnstableProductStableIds(catalogFacts);

    return records.map((record) => {
      if (record.source === 'IMMUTABLE') {
        return record.fact.pricingEvidence === 'COMPLETE'
          ? this.readyCandidate(record.fact, 'SOURCE_COMPLETE')
          : this.blockedPricingCandidate(record.fact, 'UNRESOLVED');
      }

      if (mutatedOrderDbIds.has(record.row.id)) {
        return {
          sourceFact: record.fact,
          replayEligibility: 'POST_SALE_MUTATION',
          pricingResolution:
            record.fact.pricingEvidence === 'COMPLETE'
              ? 'SOURCE_COMPLETE'
              : 'UNRESOLVED',
          resolvedFact: null,
        };
      }
      if (record.fact.pricingEvidence === 'COMPLETE') {
        return this.readyCandidate(record.fact, 'SOURCE_COMPLETE');
      }

      const resolution = resolveLegacyDailySpecialCatalogPricing({
        sourceFact: record.fact,
        row: record.row,
        catalogFacts,
        catalogPriceUnstableProductStableIds,
      });
      if (resolution.pricingResolution === 'CATALOG_STABLE_MATCH') {
        if (!resolution.resolvedFact) {
          throw new Error(
            `Catalog-stable replay resolution is missing a resolved fact: ${record.fact.orderStableId}`,
          );
        }
        return this.readyCandidate(
          resolution.resolvedFact,
          resolution.pricingResolution,
          record.fact,
        );
      }
      return this.blockedPricingCandidate(
        record.fact,
        resolution.pricingResolution,
      );
    });
  }

  private readyCandidate(
    resolvedFact: OrderFinancialFactV1,
    pricingResolution: Extract<
      OrderFinancialReplayPricingResolutionV1,
      'SOURCE_COMPLETE' | 'CATALOG_STABLE_MATCH'
    >,
    sourceFact: OrderFinancialFactV1 = resolvedFact,
  ): OrderFinancialReplayCandidateV1 {
    return {
      sourceFact,
      replayEligibility: 'ELIGIBLE',
      pricingResolution,
      resolvedFact,
    };
  }

  private blockedPricingCandidate(
    sourceFact: OrderFinancialFactV1,
    pricingResolution: Extract<
      OrderFinancialReplayPricingResolutionV1,
      'MANUAL_OVERRIDE' | 'UNRESOLVED'
    >,
  ): OrderFinancialReplayCandidateV1 {
    return {
      sourceFact,
      replayEligibility: 'PRICING_UNRESOLVED',
      pricingResolution,
      resolvedFact: null,
    };
  }

  private async findPostSaleMutationOrderDbIds(
    orderDbIds: string[],
  ): Promise<Set<string>> {
    if (orderDbIds.length === 0) return new Set();
    const amendments = await this.prisma.orderAmendment.findMany({
      where: { orderId: { in: orderDbIds } },
      select: { orderId: true, type: true, summaryJson: true },
    });
    return new Set(
      amendments
        .filter((amendment) =>
          isPostSaleMutation({
            type: String(amendment.type),
            summaryJson: amendment.summaryJson,
          }),
        )
        .map((amendment) => amendment.orderId),
    );
  }

  private async findCatalogPriceUnstableProductStableIds(
    catalogFacts: CatalogOrderItemMaterializationFact[],
  ): Promise<Set<string>> {
    if (catalogFacts.length === 0) return new Set();
    const catalogByStableId = new Map(
      catalogFacts.map((fact) => [fact.stableId, fact] as const),
    );
    const rows = await this.prisma.orderItem.findMany({
      where: {
        productStableId: { in: [...catalogByStableId.keys()] },
        isDailySpecialApplied: true,
      },
      select: ORDER_FINANCIAL_CATALOG_PRICE_EVIDENCE_SELECT,
    });
    const unstable = new Set<string>();
    for (const row of rows) {
      if (!FINANCIAL_ORDER_STATUSES.includes(row.order.status)) continue;
      if (row.order.promotionSnapshot !== null) continue;
      const catalog = catalogByStableId.get(row.productStableId);
      if (!catalog || !hasCompatibleLegacyCatalogIdentity(row, catalog))
        continue;
      const effectiveBaseUnitCents =
        resolveOrderFinancialEffectiveBaseUnitCents(row);
      if (
        effectiveBaseUnitCents !== null &&
        effectiveBaseUnitCents > catalog.basePriceCents
      ) {
        unstable.add(row.productStableId);
      }
    }
    return unstable;
  }

  private async readActiveCatalogFacts(
    stableIds: string[],
  ): Promise<CatalogOrderItemMaterializationFact[]> {
    if (stableIds.length === 0) return [];
    const facts = await Promise.all(
      stableIds.map((stableId) =>
        this.catalogOrderFacts.getActiveOrderItemMaterializationFact(stableId),
      ),
    );
    return facts.filter(
      (fact): fact is CatalogOrderItemMaterializationFact => fact !== null,
    );
  }
}
