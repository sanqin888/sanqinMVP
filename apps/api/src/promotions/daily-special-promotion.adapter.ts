import type { PromotionCandidate } from './promotion-engine';
import { resolvePromotionLinePriceCents } from './promotion-engine';

export type DailySpecialPromotionLike = {
  stableId: string;
  pricingMode: 'OVERRIDE_PRICE' | 'DISCOUNT_DELTA' | 'DISCOUNT_PERCENT';
  overridePriceCents: number | null;
  discountDeltaCents: number | null;
  discountPercent: number | null;
  disallowCoupons: boolean;
};

export function toDailySpecialPromotionCandidate(params: {
  special: DailySpecialPromotionLike;
  lineKey: string;
  productStableId: string;
  quantity: number;
  baseUnitPriceCents: number;
}): PromotionCandidate {
  const { special } = params;
  const effectiveUnitPriceCents = resolvePromotionLinePriceCents({
    basePriceCents: params.baseUnitPriceCents,
    pricingMode: special.pricingMode,
    overridePriceCents: special.overridePriceCents,
    discountDeltaCents: special.discountDeltaCents,
    discountPercent: special.discountPercent,
  });

  return {
    promotionStableId: special.stableId,
    source: 'DAILY_SPECIAL',
    priority: 100,
    eligibility: { eligible: true, code: 'ELIGIBLE' },
    stacking: {
      group: 'ITEM_PRICE',
      mode: 'EXCLUSIVE',
      excludesGroups: special.disallowCoupons ? ['COUPON'] : [],
    },
    benefit: {
      type: 'LINE_PRICE',
      lineKey: params.lineKey,
      productStableId: params.productStableId,
      quantity: Math.max(0, Math.round(params.quantity)),
      baseUnitPriceCents: Math.max(0, Math.round(params.baseUnitPriceCents)),
      effectiveUnitPriceCents,
    },
    snapshot: {
      pricingMode: special.pricingMode,
      disallowCoupons: special.disallowCoupons,
      overridePriceCents: special.overridePriceCents,
      discountDeltaCents: special.discountDeltaCents,
      discountPercent: special.discountPercent,
    },
  };
}
