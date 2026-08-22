import type {
  PromotionCandidate,
  PromotionEligibility,
  PromotionStackingMode,
} from './promotion-engine';
import { resolvePromotionDiscountCents } from './promotion-engine';

export type CouponPromotionLike = {
  couponStableId: string;
  code: string;
  title: string;
  discountCents: number;
  discountPercent?: number | null;
  minSpendCents?: number | null;
  unlockedItemStableIds?: string[];
  stackingPolicy?: PromotionStackingMode;
};

export type CouponEntitlementPromotionLike = {
  couponStableId: string;
  code: string;
  title: string;
  stackingPolicy?: PromotionStackingMode;
};

export type CouponEligibleLineItem = {
  productStableId: string;
  lineTotalCents: number;
  lineKey?: string;
};

export type CouponPromotionEvaluation = {
  applicableSubtotalCents: number;
  candidate: PromotionCandidate;
};

function normalizeRestrictedStableIds(values: readonly string[]): Set<string> {
  return new Set(values.map((value) => value.trim()).filter(Boolean));
}

function resolveApplicableLines(params: {
  restrictedStableIds: Set<string>;
  couponEligibleLineItems: readonly CouponEligibleLineItem[];
}): CouponEligibleLineItem[] {
  if (params.restrictedStableIds.size === 0) {
    return [...params.couponEligibleLineItems];
  }
  return params.couponEligibleLineItems.filter((line) =>
    params.restrictedStableIds.has(line.productStableId),
  );
}

function resolveTargetLineKeys(
  applicableLines: readonly CouponEligibleLineItem[],
): string[] | undefined {
  if (applicableLines.length === 0) return undefined;
  if (applicableLines.some((line) => !line.lineKey)) return undefined;
  return applicableLines.map((line) => line.lineKey as string);
}

export function toCouponEntitlementPromotionCandidate(
  coupon: CouponEntitlementPromotionLike,
): PromotionCandidate {
  const stackingPolicy = coupon.stackingPolicy ?? 'EXCLUSIVE';
  return {
    promotionStableId: coupon.couponStableId,
    source: 'COUPON',
    priority: 150,
    eligibility: { eligible: true, code: 'ELIGIBLE' },
    stacking: {
      group: 'COUPON_ENTITLEMENT',
      mode: stackingPolicy,
      excludesGroups: stackingPolicy === 'EXCLUSIVE' ? ['COUPON'] : [],
    },
    benefit: {
      type: 'ORDER_DISCOUNT',
      applicableSubtotalCents: 0,
      discountCents: 0,
    },
    snapshot: {
      code: coupon.code,
      title: coupon.title,
      stackingPolicy,
      entitlement: true,
    },
  };
}

export function evaluateCouponPromotion(params: {
  coupon: CouponPromotionLike;
  subtotalCents: number;
  couponEligibleLineItems?: readonly CouponEligibleLineItem[];
}): CouponPromotionEvaluation {
  const couponEligibleLineItems = params.couponEligibleLineItems ?? [];
  const restrictedStableIds = normalizeRestrictedStableIds(
    params.coupon.unlockedItemStableIds ?? [],
  );
  const applicableLines = resolveApplicableLines({
    restrictedStableIds,
    couponEligibleLineItems,
  });
  const applicableSubtotalCents =
    restrictedStableIds.size === 0
      ? Math.max(0, Math.round(params.subtotalCents))
      : applicableLines.reduce(
          (sum, line) => sum + Math.max(0, Math.round(line.lineTotalCents)),
          0,
        );

  let eligibility: PromotionEligibility = {
    eligible: true,
    code: 'ELIGIBLE',
  };
  if (
    typeof params.coupon.minSpendCents === 'number' &&
    applicableSubtotalCents < params.coupon.minSpendCents
  ) {
    eligibility = {
      eligible: false,
      code: 'MIN_SPEND_NOT_MET',
      reason: 'order subtotal does not meet coupon rules',
    };
  } else if (applicableSubtotalCents <= 0) {
    eligibility = {
      eligible: false,
      code: 'NO_APPLICABLE_SUBTOTAL',
      reason: 'coupon does not apply to selected items',
    };
  }

  const discountCents = eligibility.eligible
    ? resolvePromotionDiscountCents({
        fixedDiscountCents: params.coupon.discountCents,
        discountPercent: params.coupon.discountPercent,
        applicableSubtotalCents,
      })
    : 0;
  const stackingPolicy = params.coupon.stackingPolicy ?? 'EXCLUSIVE';

  return {
    applicableSubtotalCents,
    candidate: {
      promotionStableId: params.coupon.couponStableId,
      source: 'COUPON',
      priority: 200,
      eligibility,
      stacking: {
        group: 'COUPON',
        mode: stackingPolicy,
        excludesGroups:
          stackingPolicy === 'EXCLUSIVE' ? ['COUPON_ENTITLEMENT'] : [],
      },
      benefit: {
        type: 'ORDER_DISCOUNT',
        applicableSubtotalCents,
        discountCents,
        targetLineKeys: resolveTargetLineKeys(applicableLines),
      },
      snapshot: {
        code: params.coupon.code,
        title: params.coupon.title,
        discountCents: params.coupon.discountCents,
        discountPercent: params.coupon.discountPercent ?? null,
        minSpendCents: params.coupon.minSpendCents ?? null,
        stackingPolicy: params.coupon.stackingPolicy ?? 'EXCLUSIVE',
      },
    },
  };
}
