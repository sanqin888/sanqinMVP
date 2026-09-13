import type { CatalogOrderItemMaterializationFact } from '../menu/public-api';
import type {
  OrderFinancialFactV1,
  OrderFinancialReplayPricingResolutionV1,
} from './order-financial-facts-reader.contract';
import {
  resolveOrderFinancialEffectiveBaseUnitCents,
  type OrderFinancialSnapshot,
} from './order-financial-sale-fact';

export type LegacyDailySpecialReplayResolution = {
  pricingResolution: Extract<
    OrderFinancialReplayPricingResolutionV1,
    | 'CATALOG_STABLE_MATCH'
    | 'APPROVED_HISTORICAL_OVERRIDE'
    | 'MANUAL_OVERRIDE'
    | 'UNRESOLVED'
  >;
  resolvedFact: OrderFinancialFactV1 | null;
};

const normalizedLabel = (value: string | null | undefined): string | null =>
  value?.trim() || null;

type LegacyCatalogComparableItem = Pick<
  OrderFinancialSnapshot['items'][number],
  | 'productStableId'
  | 'displayName'
  | 'nameEn'
  | 'nameZh'
  | 'unitPriceCents'
  | 'baseUnitPriceCents'
  | 'optionsUnitPriceCents'
>;

export const hasCompatibleLegacyCatalogIdentity = (
  item: LegacyCatalogComparableItem,
  catalog: CatalogOrderItemMaterializationFact,
): boolean => {
  const historicalZh = normalizedLabel(item.nameZh);
  const currentZh = normalizedLabel(catalog.nameZh);
  if (historicalZh && currentZh && historicalZh === currentZh) return true;

  const currentEn = normalizedLabel(catalog.nameEn);
  if (!currentEn) return false;
  return [item.nameEn, item.displayName]
    .map(normalizedLabel)
    .some((label) => label !== null && label === currentEn);
};

const completeLegacyDailySpecialResolution = (params: {
  sourceFact: OrderFinancialFactV1;
  dailySpecialCents: number;
  pricingResolution: Extract<
    OrderFinancialReplayPricingResolutionV1,
    'CATALOG_STABLE_MATCH' | 'APPROVED_HISTORICAL_OVERRIDE'
  >;
}): LegacyDailySpecialReplayResolution => {
  const otherDiscountCents =
    params.sourceFact.discounts.couponCents +
    params.sourceFact.discounts.automaticPromotionCents +
    params.sourceFact.discounts.posManualCents +
    params.sourceFact.discounts.pointsRedemptionCents +
    params.sourceFact.discounts.unattributedLegacyCents;
  const totalDiscountCents = params.dailySpecialCents + otherDiscountCents;
  const nominalSubtotalCents =
    params.sourceFact.effectiveSubtotalCents + params.dailySpecialCents;

  if (
    !Number.isSafeInteger(otherDiscountCents) ||
    !Number.isSafeInteger(totalDiscountCents) ||
    !Number.isSafeInteger(nominalSubtotalCents) ||
    nominalSubtotalCents - totalDiscountCents !==
      params.sourceFact.subtotalAfterDiscountCents
  ) {
    return { pricingResolution: 'UNRESOLVED', resolvedFact: null };
  }

  return {
    pricingResolution: params.pricingResolution,
    resolvedFact: {
      ...params.sourceFact,
      pricingEvidence: 'COMPLETE',
      nominalSubtotalCents,
      discounts: {
        ...params.sourceFact.discounts,
        dailySpecialCents: params.dailySpecialCents,
        totalCents: totalDiscountCents,
      },
    },
  };
};

export const resolveApprovedHistoricalDailySpecialPricing = (params: {
  sourceFact: OrderFinancialFactV1;
  row: OrderFinancialSnapshot;
  catalogFacts: readonly CatalogOrderItemMaterializationFact[];
}): LegacyDailySpecialReplayResolution => {
  const specialItems = params.row.items.filter(
    (item) => item.isDailySpecialApplied && item.dailySpecialStableId,
  );
  if (specialItems.length === 0) {
    return { pricingResolution: 'UNRESOLVED', resolvedFact: null };
  }

  const catalogByStableId = new Map(
    params.catalogFacts.map((fact) => [fact.stableId, fact] as const),
  );
  let dailySpecialCents = 0;

  for (const item of specialItems) {
    const catalog = catalogByStableId.get(item.productStableId);
    if (
      !catalog ||
      !Number.isSafeInteger(catalog.basePriceCents) ||
      catalog.basePriceCents < 0
    ) {
      return { pricingResolution: 'UNRESOLVED', resolvedFact: null };
    }

    const effectiveBaseUnitCents =
      resolveOrderFinancialEffectiveBaseUnitCents(item);
    if (effectiveBaseUnitCents === null) {
      return { pricingResolution: 'UNRESOLVED', resolvedFact: null };
    }

    const approvedNominalBaseUnitCents = Math.max(
      catalog.basePriceCents,
      effectiveBaseUnitCents,
    );
    const lineDiscountCents =
      (approvedNominalBaseUnitCents - effectiveBaseUnitCents) * item.qty;
    if (
      !Number.isSafeInteger(lineDiscountCents) ||
      lineDiscountCents < 0 ||
      !Number.isSafeInteger(dailySpecialCents + lineDiscountCents)
    ) {
      return { pricingResolution: 'UNRESOLVED', resolvedFact: null };
    }
    dailySpecialCents += lineDiscountCents;
  }

  return completeLegacyDailySpecialResolution({
    sourceFact: params.sourceFact,
    dailySpecialCents,
    pricingResolution: 'APPROVED_HISTORICAL_OVERRIDE',
  });
};

export const resolveLegacyDailySpecialCatalogPricing = (params: {
  sourceFact: OrderFinancialFactV1;
  row: OrderFinancialSnapshot;
  catalogFacts: readonly CatalogOrderItemMaterializationFact[];
  catalogPriceUnstableProductStableIds?: ReadonlySet<string>;
}): LegacyDailySpecialReplayResolution => {
  const specialItems = params.row.items.filter(
    (item) => item.isDailySpecialApplied && item.dailySpecialStableId,
  );
  if (specialItems.length === 0) {
    return { pricingResolution: 'UNRESOLVED', resolvedFact: null };
  }

  const catalogByStableId = new Map(
    params.catalogFacts.map((fact) => [fact.stableId, fact] as const),
  );
  let dailySpecialCents = 0;

  for (const item of specialItems) {
    const catalog = catalogByStableId.get(item.productStableId);
    if (!catalog) {
      return { pricingResolution: 'UNRESOLVED', resolvedFact: null };
    }
    if (!hasCompatibleLegacyCatalogIdentity(item, catalog)) {
      return { pricingResolution: 'MANUAL_OVERRIDE', resolvedFact: null };
    }
    if (
      params.catalogPriceUnstableProductStableIds?.has(item.productStableId)
    ) {
      return { pricingResolution: 'MANUAL_OVERRIDE', resolvedFact: null };
    }

    const effectiveBaseUnitCents =
      resolveOrderFinancialEffectiveBaseUnitCents(item);
    if (effectiveBaseUnitCents === null) {
      return { pricingResolution: 'UNRESOLVED', resolvedFact: null };
    }
    if (
      !Number.isSafeInteger(catalog.basePriceCents) ||
      catalog.basePriceCents < effectiveBaseUnitCents
    ) {
      return { pricingResolution: 'MANUAL_OVERRIDE', resolvedFact: null };
    }

    const lineDiscountCents =
      (catalog.basePriceCents - effectiveBaseUnitCents) * item.qty;
    if (
      !Number.isSafeInteger(lineDiscountCents) ||
      lineDiscountCents < 0 ||
      !Number.isSafeInteger(dailySpecialCents + lineDiscountCents)
    ) {
      return { pricingResolution: 'UNRESOLVED', resolvedFact: null };
    }
    dailySpecialCents += lineDiscountCents;
  }

  return completeLegacyDailySpecialResolution({
    sourceFact: params.sourceFact,
    dailySpecialCents,
    pricingResolution: 'CATALOG_STABLE_MATCH',
  });
};
