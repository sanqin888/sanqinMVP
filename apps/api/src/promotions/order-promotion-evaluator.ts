import {
  evaluateCouponPromotion,
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

export type PromotionOrderLine = {
  lineKey: string;
  productStableId: string;
  quantity: number;
  baseUnitPriceCents: number;
  lineTotalCents: number;
  dailySpecial?: DailySpecialPromotionLike | null;
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
}): PromotionOrderEvaluation {
  const dailySpecialCandidates = params.lines.flatMap((line) => {
    if (!line.dailySpecial) return [];
    return [
      toDailySpecialPromotionCandidate({
        special: line.dailySpecial,
        lineKey: line.lineKey,
        productStableId: line.productStableId,
        quantity: line.quantity,
        baseUnitPriceCents: line.baseUnitPriceCents,
      }),
    ];
  });

  const dailySpecialResolution = resolvePromotionCandidates(
    dailySpecialCandidates,
  );
  const couponBlockedLineKeys = new Set(
    dailySpecialResolution.adjustments.flatMap((adjustment) =>
      adjustment.lineKey &&
      adjustment.excludedStackingGroups?.includes('COUPON')
        ? [adjustment.lineKey]
        : [],
    ),
  );
  const couponEligibleLines = params.lines.filter(
    (line) => !couponBlockedLineKeys.has(line.lineKey),
  );
  const couponEligibleSubtotalCents = couponEligibleLines.reduce(
    (sum, line) => sum + normalizeCents(line.lineTotalCents),
    0,
  );

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
  const resolution = resolvePromotionCandidates([
    ...dailySpecialCandidates,
    ...(couponCandidate ? [couponCandidate] : []),
  ]);

  return {
    ...resolution,
    couponEligibleSubtotalCents,
    couponEligibleLineKeys: couponEligibleLines.map((line) => line.lineKey),
    snapshot: createPromotionSnapshot(resolution.adjustments),
  };
}
