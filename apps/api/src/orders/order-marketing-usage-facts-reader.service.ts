import { Inject, Injectable } from '@nestjs/common';

import {
  ORDER_FINANCIAL_FACTS_READER,
  type OrderFinancialFactsReaderPort,
} from './order-financial-facts-reader.contract';
import type {
  OrderMarketingActivitySourceV1,
  OrderMarketingMetricEvidenceV1,
  OrderMarketingUsageFactV1,
  OrderMarketingUsageFactsReaderPort,
  OrderMarketingUsageRangeV1,
} from './order-marketing-usage-facts-reader.contract';
import { PrismaService } from './orders-prisma';

type JsonRecord = Record<string, unknown>;

type SnapshotAdjustment = {
  source: OrderMarketingActivitySourceV1;
  activityStableId: string;
  discountCents: number;
  quantity: number | null;
  targetLineKeys: string[];
};

const asRecord = (value: unknown): JsonRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const asNonNegativeInteger = (value: unknown): number | null =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0
    ? value
    : null;

const isMarketingSource = (
  value: unknown,
): value is OrderMarketingActivitySourceV1 =>
  value === 'DAILY_SPECIAL' ||
  value === 'AUTOMATIC_PROMOTION' ||
  value === 'COUPON' ||
  value === 'LOYALTY_PROMOTION';

const parseTargetLineKeys = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map(asNonEmptyString)
        .filter((entry): entry is string => entry !== null),
    ),
  );
};

const parsePromotionSnapshot = (value: unknown): SnapshotAdjustment[] => {
  const snapshot = asRecord(value);
  if (snapshot?.version !== 1 || !Array.isArray(snapshot.adjustments)) return [];

  return snapshot.adjustments.flatMap((rawAdjustment) => {
    const adjustment = asRecord(rawAdjustment);
    if (!adjustment || !isMarketingSource(adjustment.source)) return [];

    const activityStableId = asNonEmptyString(adjustment.promotionStableId);
    const discountCents = asNonNegativeInteger(adjustment.discountCents);
    const metadata = asRecord(adjustment.snapshot);
    if (
      !activityStableId ||
      discountCents === null ||
      (adjustment.source === 'DAILY_SPECIAL' && metadata?.priceApplied === false)
    ) {
      return [];
    }

    return [
      {
        source: adjustment.source,
        activityStableId,
        discountCents,
        quantity: asNonNegativeInteger(adjustment.quantity),
        targetLineKeys: parseTargetLineKeys(adjustment.targetLineKeys),
      } satisfies SnapshotAdjustment,
    ];
  });
};

type OrderUsageRow = {
  orderStableId: string;
  status: string;
  promotionSnapshot: unknown;
  items: Array<{
    id: string;
    qty: number;
    isDailySpecialApplied: boolean;
    dailySpecialStableId: string | null;
  }>;
};

type UsageAccumulator = {
  source: OrderMarketingActivitySourceV1;
  activityStableId: string;
  discountCents: number | null;
  discountEvidence: OrderMarketingMetricEvidenceV1;
  affectedItemQuantity: number | null;
  affectedItemQuantityEvidence: OrderMarketingMetricEvidenceV1;
};

const usageKey = (
  source: OrderMarketingActivitySourceV1,
  activityStableId: string,
): string => `${source}\u0000${activityStableId}`;

function snapshotQuantity(
  adjustment: SnapshotAdjustment,
  itemQuantityById: ReadonlyMap<string, number>,
): {
  quantity: number | null;
  evidence: OrderMarketingMetricEvidenceV1;
} {
  if (adjustment.source === 'LOYALTY_PROMOTION') {
    return { quantity: null, evidence: 'NOT_APPLICABLE' };
  }
  if (adjustment.source === 'DAILY_SPECIAL' && adjustment.quantity !== null) {
    return { quantity: adjustment.quantity, evidence: 'COMPLETE' };
  }
  if (adjustment.targetLineKeys.length === 0) {
    return { quantity: null, evidence: 'UNAVAILABLE' };
  }

  let quantity = 0;
  for (const lineKey of adjustment.targetLineKeys) {
    const lineQuantity = itemQuantityById.get(lineKey);
    if (lineQuantity === undefined) {
      return { quantity: null, evidence: 'UNAVAILABLE' };
    }
    quantity += lineQuantity;
  }
  return { quantity, evidence: 'COMPLETE' };
}

function mergeQuantity(
  current: UsageAccumulator,
  quantity: number | null,
  evidence: OrderMarketingMetricEvidenceV1,
): void {
  if (evidence === 'NOT_APPLICABLE') {
    current.affectedItemQuantity = null;
    current.affectedItemQuantityEvidence = 'NOT_APPLICABLE';
    return;
  }
  if (
    current.affectedItemQuantityEvidence === 'NOT_APPLICABLE' ||
    evidence === 'UNAVAILABLE'
  ) {
    if (current.affectedItemQuantityEvidence !== 'NOT_APPLICABLE') {
      current.affectedItemQuantity = null;
      current.affectedItemQuantityEvidence = 'UNAVAILABLE';
    }
    return;
  }
  if (current.affectedItemQuantityEvidence === 'UNAVAILABLE') return;

  current.affectedItemQuantity =
    (current.affectedItemQuantity ?? 0) + (quantity ?? 0);
  current.affectedItemQuantityEvidence = 'COMPLETE';
}

function buildOrderUsage(row: OrderUsageRow): UsageAccumulator[] {
  const accumulators = new Map<string, UsageAccumulator>();
  const itemQuantityById = new Map(row.items.map((item) => [item.id, item.qty]));
  const snapshotAdjustments = parsePromotionSnapshot(row.promotionSnapshot);

  for (const adjustment of snapshotAdjustments) {
    const key = usageKey(adjustment.source, adjustment.activityStableId);
    const existing = accumulators.get(key) ?? {
      source: adjustment.source,
      activityStableId: adjustment.activityStableId,
      discountCents: 0,
      discountEvidence: 'COMPLETE' as const,
      affectedItemQuantity: 0,
      affectedItemQuantityEvidence: 'COMPLETE' as const,
    };
    existing.discountCents =
      (existing.discountCents ?? 0) + adjustment.discountCents;

    const quantity = snapshotQuantity(adjustment, itemQuantityById);
    mergeQuantity(existing, quantity.quantity, quantity.evidence);
    accumulators.set(key, existing);
  }

  const dailySpecialQuantities = new Map<string, number>();
  for (const item of row.items) {
    if (!item.isDailySpecialApplied || !item.dailySpecialStableId) continue;
    dailySpecialQuantities.set(
      item.dailySpecialStableId,
      (dailySpecialQuantities.get(item.dailySpecialStableId) ?? 0) + item.qty,
    );
  }

  for (const [activityStableId, quantity] of dailySpecialQuantities) {
    const key = usageKey('DAILY_SPECIAL', activityStableId);
    const existing = accumulators.get(key);
    if (existing) {
      existing.affectedItemQuantity = quantity;
      existing.affectedItemQuantityEvidence = 'COMPLETE';
      continue;
    }
    accumulators.set(key, {
      source: 'DAILY_SPECIAL',
      activityStableId,
      discountCents: null,
      discountEvidence: 'UNAVAILABLE',
      affectedItemQuantity: quantity,
      affectedItemQuantityEvidence: 'COMPLETE',
    });
  }

  return Array.from(accumulators.values());
}

@Injectable()
export class OrderMarketingUsageFactsReaderService
  implements OrderMarketingUsageFactsReaderPort
{
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ORDER_FINANCIAL_FACTS_READER)
    private readonly financialFacts: OrderFinancialFactsReaderPort,
  ) {}

  async readUsageFactsForRange(
    range: OrderMarketingUsageRangeV1,
  ): Promise<OrderMarketingUsageFactV1[]> {
    const financialFacts = await this.financialFacts.readFactsForRange(range);
    if (financialFacts.length === 0) return [];

    const rows = await this.prisma.order.findMany({
      where: {
        orderStableId: {
          in: financialFacts.map((fact) => fact.orderStableId),
        },
      },
      select: {
        orderStableId: true,
        status: true,
        promotionSnapshot: true,
        items: {
          select: {
            id: true,
            qty: true,
            isDailySpecialApplied: true,
            dailySpecialStableId: true,
          },
        },
      },
    });
    const rowsByOrder = new Map(
      rows.map((row) => [row.orderStableId, row] as const),
    );

    return financialFacts
      .flatMap((financialFact) => {
        const row = rowsByOrder.get(financialFact.orderStableId);
        if (
          !row ||
          (row.status !== 'paid' &&
            row.status !== 'making' &&
            row.status !== 'ready' &&
            row.status !== 'completed')
        ) {
          return [];
        }

        return buildOrderUsage(row).map(
          (usage): OrderMarketingUsageFactV1 => ({
            version: 1,
            orderStableId: financialFact.orderStableId,
            storeStableId: financialFact.storeStableId,
            occurredAt: financialFact.occurredAt,
            activityStableId: usage.activityStableId,
            source: usage.source,
            affectedItemQuantity: usage.affectedItemQuantity,
            affectedItemQuantityEvidence:
              usage.affectedItemQuantityEvidence,
            discountCents: usage.discountCents,
            discountEvidence: usage.discountEvidence,
            associatedSalesCents: financialFact.subtotalAfterDiscountCents,
            associatedSalesEvidence: financialFact.sourceEvidence,
          }),
        );
      })
      .sort((left, right) => {
        const timeDelta = left.occurredAt.getTime() - right.occurredAt.getTime();
        if (timeDelta !== 0) return timeDelta;
        const orderDelta = left.orderStableId.localeCompare(right.orderStableId);
        if (orderDelta !== 0) return orderDelta;
        return usageKey(left.source, left.activityStableId).localeCompare(
          usageKey(right.source, right.activityStableId),
        );
      });
  }
}
