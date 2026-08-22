import type { DateTime } from 'luxon';
import {
  evaluateCouponPromotion,
  toCouponEntitlementPromotionCandidate,
  type CouponEntitlementPromotionLike,
  type CouponPromotionLike,
} from './coupon-promotion.adapter';
import {
  toDailySpecialPromotionCandidate,
  type DailySpecialPromotionLike,
} from './daily-special-promotion.adapter';
import {
  createPromotionSnapshot,
  resolvePromotionCandidates,
  type PromotionResolution,
  type PromotionSnapshotV1,
} from './promotion-engine';
import {
  toPromotionRuleCandidate,
  type PromotionRuleLike,
} from './promotion-rule.adapter';
import { toPosManualDiscountPromotionCandidate } from './pos-manual-discount.adapter';

export type PromotionOrderLine = {
  lineKey: string;
  productStableId: string;
  quantity: number;
  baseUnitPriceCents: number;
  lineTotalCents: number;
  dailySpecial?: DailySpecialPromotionLike | null;
  dailySpecialPriceApplied?: boolean;
};

export type PromotionOrderEvaluation = PromotionResolution & {
  couponEligibleSubtotalCents: number;
  couponEligibleLineKeys: string[];
  snapshot: PromotionSnapshotV1;
};

function normalizeCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function evaluateOrderPromotions(params: {
  lines: readonly PromotionOrderLine[];
  coupon?: CouponPromotionLike | null;
  entitlementCoupon?: CouponEntitlementPromotionLike | null;
  promotionContext?: {
    rules: readonly PromotionRuleLike[];
    now: DateTime;
  };
  posDiscountCents?: number;
}): PromotionOrderEvaluation {
  const dailySpecialCandidates = params.lines.flatMap((line) => {
    if (!line.dailySpecial) return [];

    const candidate = toDailySpecialPromotionCandidate({
      special: line.dailySpecial,
      lineKey: line.lineKey,
      productStableId: line.productStableId,
      quantity: line.quantity,
      baseUnitPriceCents: line.baseUnitPriceCents,
    });
    const priceApplied = line.dailySpecialPriceApplied !== false;
    candidate.snapshot = {
      ...(candidate.snapshot ?? {}),
      priceApplied,
    };
    if (!priceApplied && candidate.benefit.type === 'LINE_PRICE') {
      candidate.benefit = {
        ...candidate.benefit,
        effectiveUnitPriceCents: candidate.benefit.baseUnitPriceCents,
      };
    }
    return [candidate];
  });

  const promotionContext = params.promotionContext;
  const ruleCandidates = promotionContext
    ? promotionContext.rules.map((rule) =>
        toPromotionRuleCandidate({
          rule,
          lines: params.lines,
          now: promotionContext.now,
        }),
      )
    : [];
  const preCouponResolution = resolvePromotionCandidates([
    ...dailySpecialCandidates,
    ...ruleCandidates,
  ]);
  const allLineKeys = params.lines.map((line) => line.lineKey);
  const couponBlockedLineKeys = new Set(
    preCouponResolution.adjustments.flatMap((adjustment) => {
      if (!adjustment.excludedStackingGroups?.includes('COUPON')) return [];
      if (adjustment.lineKey) return [adjustment.lineKey];
      if (adjustment.targetLineKeys?.length) return adjustment.targetLineKeys;
      return allLineKeys;
    }),
  );
  const couponEligibleLines = params.lines.filter(
    (line) => !couponBlockedLineKeys.has(line.lineKey),
  );
  const couponEligibleSubtotalCents = couponEligibleLines.reduce(
    (sum, line) => sum + normalizeCents(line.lineTotalCents),
    0,
  );

  const entitlementCouponCandidate = params.entitlementCoupon
    ? toCouponEntitlementPromotionCandidate(params.entitlementCoupon)
    : null;
  const couponCandidate = params.coupon
    ? evaluateCouponPromotion({
        coupon: params.coupon,
        subtotalCents: couponEligibleSubtotalCents,
        couponEligibleLineItems: couponEligibleLines.map((line) => ({
          lineKey: line.lineKey,
          productStableId: line.productStableId,
          lineTotalCents: normalizeCents(line.lineTotalCents),
        })),
      }).candidate
    : null;
  const subtotalCents = params.lines.reduce(
    (sum, line) => sum + normalizeCents(line.lineTotalCents),
    0,
  );
  const posDiscountCandidate = toPosManualDiscountPromotionCandidate({
    discountCents: params.posDiscountCents ?? 0,
    subtotalCents,
  });
  const resolution = resolvePromotionCandidates([
    ...dailySpecialCandidates,
    ...ruleCandidates,
    ...(entitlementCouponCandidate ? [entitlementCouponCandidate] : []),
    ...(couponCandidate ? [couponCandidate] : []),
    ...(posDiscountCandidate ? [posDiscountCandidate] : []),
  ]);

  return {
    ...resolution,
    couponEligibleSubtotalCents,
    couponEligibleLineKeys: couponEligibleLines.map((line) => line.lineKey),
    snapshot: createPromotionSnapshot(resolution.adjustments),
  };
}
