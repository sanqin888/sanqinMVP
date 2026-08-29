import type {
  OrderDiscountDisplayEntry,
  OrderDiscountDisplaySource,
} from '@shared/order';

type PricingDisplayItem = {
  id?: string | null;
  productStableId: string;
  displayName?: string | null;
  nameZh?: string | null;
  nameEn?: string | null;
};

type BuildOrderPricingDisplayParams = {
  effectiveSubtotalCents: number;
  promotionSnapshot: unknown;
  items: readonly PricingDisplayItem[];
  couponTitleSnapshot?: string | null;
  couponDiscountCents?: number | null;
  loyaltyRedeemCents?: number | null;
  subtotalAfterDiscountCents?: number | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asCents(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
}

function isDisplayDiscountSource(
  value: unknown,
): value is Exclude<OrderDiscountDisplaySource, 'OTHER'> {
  return (
    value === 'DAILY_SPECIAL' ||
    value === 'COUPON' ||
    value === 'AUTOMATIC_PROMOTION' ||
    value === 'POS_MANUAL_DISCOUNT'
  );
}

function mergeDiscountEntries(
  entries: readonly OrderDiscountDisplayEntry[],
): OrderDiscountDisplayEntry[] {
  const grouped = new Map<string, OrderDiscountDisplayEntry>();

  for (const entry of entries) {
    const key = [
      entry.source,
      entry.promotionStableId ?? '',
      entry.productStableId ?? '',
      entry.title ?? '',
      entry.titleZh ?? '',
      entry.titleEn ?? '',
    ].join('|');
    const current = grouped.get(key);
    if (current) {
      current.discountCents += entry.discountCents;
      continue;
    }
    grouped.set(key, { ...entry });
  }

  return Array.from(grouped.values());
}

function readSnapshotDiscountEntries(params: {
  promotionSnapshot: unknown;
  items: readonly PricingDisplayItem[];
}): OrderDiscountDisplayEntry[] {
  const snapshot = asRecord(params.promotionSnapshot);
  if (
    !snapshot ||
    snapshot.version !== 1 ||
    !Array.isArray(snapshot.adjustments)
  ) {
    return [];
  }

  const itemByStableId = new Map(
    params.items.map((item) => [item.productStableId, item] as const),
  );
  const itemByLineKey = new Map<string, PricingDisplayItem>();
  for (const item of params.items) {
    if (item.id) itemByLineKey.set(item.id, item);
  }

  return snapshot.adjustments.flatMap((rawAdjustment) => {
    const adjustment = asRecord(rawAdjustment);
    if (!adjustment || !isDisplayDiscountSource(adjustment.source)) return [];

    const discountCents = asCents(adjustment.discountCents);
    if (discountCents <= 0) return [];

    const productStableId = asNonEmptyString(adjustment.productStableId);
    const lineKey = asNonEmptyString(adjustment.lineKey);
    const item =
      (productStableId ? itemByStableId.get(productStableId) : undefined) ??
      (lineKey ? itemByLineKey.get(lineKey) : undefined);
    const metadata = asRecord(adjustment.snapshot);

    return [
      {
        promotionStableId: asNonEmptyString(adjustment.promotionStableId),
        source: adjustment.source,
        title: asNonEmptyString(metadata?.title),
        titleZh: asNonEmptyString(metadata?.titleZh),
        titleEn: asNonEmptyString(metadata?.titleEn),
        productStableId,
        productName: item?.displayName ?? null,
        productNameZh: item?.nameZh ?? null,
        productNameEn: item?.nameEn ?? null,
        discountCents,
      } satisfies OrderDiscountDisplayEntry,
    ];
  });
}

export function buildOrderPricingDisplay(
  params: BuildOrderPricingDisplayParams,
): {
  displaySubtotalCents: number;
  discounts: OrderDiscountDisplayEntry[];
} {
  const effectiveSubtotalCents = asCents(params.effectiveSubtotalCents);
  const couponDiscountCents = asCents(params.couponDiscountCents);
  const loyaltyRedeemCents = asCents(params.loyaltyRedeemCents);
  const couponTitleSnapshot = asNonEmptyString(params.couponTitleSnapshot);

  const entries = readSnapshotDiscountEntries({
    promotionSnapshot: params.promotionSnapshot,
    items: params.items,
  });

  const couponEntryIndex = entries.findIndex(
    (entry) => entry.source === 'COUPON',
  );
  if (couponEntryIndex >= 0 && couponTitleSnapshot) {
    const couponEntry = entries[couponEntryIndex];
    if (
      couponEntry &&
      !couponEntry.title &&
      !couponEntry.titleZh &&
      !couponEntry.titleEn
    ) {
      entries[couponEntryIndex] = {
        ...couponEntry,
        title: couponTitleSnapshot,
      };
    }
  } else if (couponDiscountCents > 0) {
    entries.push({
      promotionStableId: null,
      source: 'COUPON',
      title: couponTitleSnapshot,
      titleZh: null,
      titleEn: null,
      productStableId: null,
      productName: null,
      productNameZh: null,
      productNameEn: null,
      discountCents: couponDiscountCents,
    });
  }

  const subtotalAfterDiscountCents =
    typeof params.subtotalAfterDiscountCents === 'number' &&
    Number.isFinite(params.subtotalAfterDiscountCents)
      ? Math.max(0, Math.round(params.subtotalAfterDiscountCents))
      : null;
  const expectedNonDailyDiscountCents =
    subtotalAfterDiscountCents === null
      ? couponDiscountCents
      : Math.max(
          0,
          effectiveSubtotalCents -
            subtotalAfterDiscountCents -
            loyaltyRedeemCents,
        );
  const knownNonDailyDiscountCents = entries
    .filter((entry) => entry.source !== 'DAILY_SPECIAL')
    .reduce((sum, entry) => sum + entry.discountCents, 0);
  const unattributedDiscountCents = Math.max(
    0,
    expectedNonDailyDiscountCents - knownNonDailyDiscountCents,
  );
  if (unattributedDiscountCents > 0) {
    entries.push({
      promotionStableId: null,
      source: 'OTHER',
      title: null,
      titleZh: null,
      titleEn: null,
      productStableId: null,
      productName: null,
      productNameZh: null,
      productNameEn: null,
      discountCents: unattributedDiscountCents,
    });
  }

  const discounts = mergeDiscountEntries(entries);
  const dailySpecialSavingsCents = discounts
    .filter((entry) => entry.source === 'DAILY_SPECIAL')
    .reduce((sum, entry) => sum + entry.discountCents, 0);

  return {
    displaySubtotalCents: effectiveSubtotalCents + dailySpecialSavingsCents,
    discounts,
  };
}
