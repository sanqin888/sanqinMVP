export type PromotionSource =
  | 'DAILY_SPECIAL'
  | 'COUPON'
  | 'AUTOMATIC_PROMOTION'
  | 'POS_MANUAL_DISCOUNT'
  | 'LOYALTY_PROMOTION';

export type PromotionStackingGroup =
  | 'ITEM_PRICE'
  | 'COUPON'
  | 'COUPON_ENTITLEMENT'
  | 'AUTOMATIC_DISCOUNT'
  | 'POS_MANUAL_DISCOUNT'
  | 'LOYALTY_BONUS';
export type PromotionStackingMode = 'EXCLUSIVE' | 'STACKABLE';

export type PromotionEligibilityCode =
  | 'ELIGIBLE'
  | 'INACTIVE'
  | 'MIN_SPEND_NOT_MET'
  | 'NO_APPLICABLE_SUBTOTAL'
  | 'STACKING_CONFLICT';

export type PromotionEligibility =
  | { eligible: true; code: 'ELIGIBLE' }
  | {
      eligible: false;
      code: Exclude<PromotionEligibilityCode, 'ELIGIBLE'>;
      reason?: string;
    };

export type PromotionStackingRule = {
  group: PromotionStackingGroup;
  mode: PromotionStackingMode;
  excludesGroups?: PromotionStackingGroup[];
};

export type PromotionLinePriceBenefit = {
  type: 'LINE_PRICE';
  lineKey: string;
  productStableId: string;
  quantity: number;
  baseUnitPriceCents: number;
  effectiveUnitPriceCents: number;
};

export type PromotionOrderDiscountBenefit = {
  type: 'ORDER_DISCOUNT';
  applicableSubtotalCents: number;
  discountCents: number;
  targetLineKeys?: string[];
};

export type PromotionLoyaltyMultiplierBenefit = {
  type: 'LOYALTY_MULTIPLIER';
  multiplier: number;
};

export type PromotionBenefit =
  | PromotionLinePriceBenefit
  | PromotionOrderDiscountBenefit
  | PromotionLoyaltyMultiplierBenefit;

export type PromotionCandidate = {
  promotionStableId: string;
  source: PromotionSource;
  priority: number;
  eligibility: PromotionEligibility;
  stacking: PromotionStackingRule;
  benefit: PromotionBenefit;
  snapshot?: Record<string, string | number | boolean | null>;
};

export type PromotionAdjustment = {
  promotionStableId: string;
  source: PromotionSource;
  scope: 'LINE_ITEM' | 'ORDER' | 'LOYALTY';
  discountCents: number;
  stackingGroup: PromotionStackingGroup;
  stackingMode: PromotionStackingMode;
  excludedStackingGroups?: PromotionStackingGroup[];
  lineKey?: string;
  productStableId?: string;
  quantity?: number;
  baseUnitPriceCents?: number;
  effectiveUnitPriceCents?: number;
  applicableSubtotalCents?: number;
  targetLineKeys?: string[];
  loyaltyMultiplier?: number;
  snapshot?: Record<string, string | number | boolean | null>;
};

export type PromotionRejectedCandidate = {
  promotionStableId: string;
  source: PromotionSource;
  code: Exclude<PromotionEligibilityCode, 'ELIGIBLE'>;
  reason?: string;
};

export type PromotionResolution = {
  adjustments: PromotionAdjustment[];
  rejected: PromotionRejectedCandidate[];
  totalDiscountCents: number;
};

export type PromotionSnapshotV1 = {
  version: 1;
  adjustments: PromotionAdjustment[];
};

function normalizeCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function normalizePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function resolvePromotionDiscountCents(params: {
  fixedDiscountCents: number;
  discountPercent?: number | null;
  applicableSubtotalCents: number;
}): number {
  const subtotal = normalizeCents(params.applicableSubtotalCents);
  if (subtotal === 0) return 0;

  if (typeof params.discountPercent === 'number') {
    const percent = normalizePercent(params.discountPercent);
    return Math.min(subtotal, Math.round((subtotal * percent) / 100));
  }

  return Math.min(subtotal, normalizeCents(params.fixedDiscountCents));
}

export function resolvePromotionLinePriceCents(params: {
  basePriceCents: number;
  pricingMode: 'OVERRIDE_PRICE' | 'DISCOUNT_DELTA' | 'DISCOUNT_PERCENT';
  overridePriceCents?: number | null;
  discountDeltaCents?: number | null;
  discountPercent?: number | null;
}): number {
  const basePriceCents = normalizeCents(params.basePriceCents);
  let effective = basePriceCents;

  switch (params.pricingMode) {
    case 'OVERRIDE_PRICE':
      if (typeof params.overridePriceCents === 'number') {
        effective = params.overridePriceCents;
      }
      break;
    case 'DISCOUNT_DELTA':
      if (typeof params.discountDeltaCents === 'number') {
        effective = basePriceCents - params.discountDeltaCents;
      }
      break;
    case 'DISCOUNT_PERCENT':
      if (typeof params.discountPercent === 'number') {
        effective = Math.round(
          (basePriceCents * (100 - params.discountPercent)) / 100,
        );
      }
      break;
  }

  if (!Number.isFinite(effective)) return basePriceCents;
  return Math.max(0, Math.min(basePriceCents, Math.round(effective)));
}

function candidateTargetLineKeys(
  candidate: PromotionCandidate,
): string[] | null {
  if (candidate.benefit.type === 'LINE_PRICE') {
    return [candidate.benefit.lineKey];
  }
  if (candidate.benefit.type === 'ORDER_DISCOUNT') {
    return candidate.benefit.targetLineKeys ?? null;
  }
  return null;
}

function lineTargetsOverlap(
  left: PromotionCandidate,
  right: PromotionCandidate,
): boolean {
  const leftTargets = candidateTargetLineKeys(left);
  const rightTargets = candidateTargetLineKeys(right);
  if (leftTargets === null || rightTargets === null) return true;

  const rightSet = new Set(rightTargets);
  return leftTargets.some((lineKey) => rightSet.has(lineKey));
}

function candidatesConflict(
  left: PromotionCandidate,
  right: PromotionCandidate,
): boolean {
  if (left.stacking.group === right.stacking.group) {
    const hasExclusiveCandidate =
      left.stacking.mode === 'EXCLUSIVE' || right.stacking.mode === 'EXCLUSIVE';
    if (!hasExclusiveCandidate) return false;

    // Coupons are order-level selections, so EXCLUSIVE remains global within
    // that group. Item-price promotions are exclusive only on overlapping
    // lines; unrelated DailySpecial lines must be able to coexist in one order.
    if (left.stacking.group === 'COUPON') return true;
    return lineTargetsOverlap(left, right);
  }

  if (!lineTargetsOverlap(left, right)) return false;

  return (
    (left.stacking.excludesGroups ?? []).includes(right.stacking.group) ||
    (right.stacking.excludesGroups ?? []).includes(left.stacking.group)
  );
}

function copyExcludedGroups(
  candidate: PromotionCandidate,
): PromotionStackingGroup[] | undefined {
  return candidate.stacking.excludesGroups
    ? [...candidate.stacking.excludesGroups]
    : undefined;
}

function toAdjustment(candidate: PromotionCandidate): PromotionAdjustment {
  if (candidate.benefit.type === 'LINE_PRICE') {
    const benefit = candidate.benefit;
    const perUnitDiscount = Math.max(
      0,
      benefit.baseUnitPriceCents - benefit.effectiveUnitPriceCents,
    );
    return {
      promotionStableId: candidate.promotionStableId,
      source: candidate.source,
      scope: 'LINE_ITEM',
      discountCents: perUnitDiscount * Math.max(0, benefit.quantity),
      stackingGroup: candidate.stacking.group,
      stackingMode: candidate.stacking.mode,
      excludedStackingGroups: copyExcludedGroups(candidate),
      lineKey: benefit.lineKey,
      productStableId: benefit.productStableId,
      quantity: benefit.quantity,
      baseUnitPriceCents: benefit.baseUnitPriceCents,
      effectiveUnitPriceCents: benefit.effectiveUnitPriceCents,
      snapshot: candidate.snapshot,
    };
  }

  if (candidate.benefit.type === 'LOYALTY_MULTIPLIER') {
    return {
      promotionStableId: candidate.promotionStableId,
      source: candidate.source,
      scope: 'LOYALTY',
      discountCents: 0,
      stackingGroup: candidate.stacking.group,
      stackingMode: candidate.stacking.mode,
      excludedStackingGroups: copyExcludedGroups(candidate),
      loyaltyMultiplier: Math.max(1, candidate.benefit.multiplier),
      snapshot: candidate.snapshot,
    };
  }

  return {
    promotionStableId: candidate.promotionStableId,
    source: candidate.source,
    scope: 'ORDER',
    discountCents: normalizeCents(candidate.benefit.discountCents),
    stackingGroup: candidate.stacking.group,
    stackingMode: candidate.stacking.mode,
    excludedStackingGroups: copyExcludedGroups(candidate),
    applicableSubtotalCents: normalizeCents(
      candidate.benefit.applicableSubtotalCents,
    ),
    targetLineKeys: candidate.benefit.targetLineKeys,
    snapshot: candidate.snapshot,
  };
}

export function resolvePromotionCandidates(
  candidates: readonly PromotionCandidate[],
): PromotionResolution {
  const ordered = candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((left, right) => {
      if (left.candidate.priority !== right.candidate.priority) {
        return left.candidate.priority - right.candidate.priority;
      }
      return left.index - right.index;
    });

  const acceptedCandidates: PromotionCandidate[] = [];
  const adjustments: PromotionAdjustment[] = [];
  const rejected: PromotionRejectedCandidate[] = [];

  for (const { candidate } of ordered) {
    if (!candidate.eligibility.eligible) {
      rejected.push({
        promotionStableId: candidate.promotionStableId,
        source: candidate.source,
        code: candidate.eligibility.code,
        reason: candidate.eligibility.reason,
      });
      continue;
    }

    const conflict = acceptedCandidates.find((accepted) =>
      candidatesConflict(accepted, candidate),
    );
    if (conflict) {
      rejected.push({
        promotionStableId: candidate.promotionStableId,
        source: candidate.source,
        code: 'STACKING_CONFLICT',
        reason: `conflicts with ${conflict.source}:${conflict.promotionStableId}`,
      });
      continue;
    }

    acceptedCandidates.push(candidate);
    adjustments.push(toAdjustment(candidate));
  }

  return {
    adjustments,
    rejected,
    totalDiscountCents: adjustments.reduce(
      (total, adjustment) => total + adjustment.discountCents,
      0,
    ),
  };
}

function snapshotAdjustment(
  adjustment: PromotionAdjustment,
): PromotionAdjustment {
  return {
    promotionStableId: adjustment.promotionStableId,
    source: adjustment.source,
    scope: adjustment.scope,
    discountCents: adjustment.discountCents,
    stackingGroup: adjustment.stackingGroup,
    stackingMode: adjustment.stackingMode,
    ...(adjustment.excludedStackingGroups
      ? { excludedStackingGroups: [...adjustment.excludedStackingGroups] }
      : {}),
    ...(adjustment.lineKey ? { lineKey: adjustment.lineKey } : {}),
    ...(adjustment.productStableId
      ? { productStableId: adjustment.productStableId }
      : {}),
    ...(typeof adjustment.quantity === 'number'
      ? { quantity: adjustment.quantity }
      : {}),
    ...(typeof adjustment.baseUnitPriceCents === 'number'
      ? { baseUnitPriceCents: adjustment.baseUnitPriceCents }
      : {}),
    ...(typeof adjustment.effectiveUnitPriceCents === 'number'
      ? { effectiveUnitPriceCents: adjustment.effectiveUnitPriceCents }
      : {}),
    ...(typeof adjustment.applicableSubtotalCents === 'number'
      ? { applicableSubtotalCents: adjustment.applicableSubtotalCents }
      : {}),
    ...(adjustment.targetLineKeys
      ? { targetLineKeys: [...adjustment.targetLineKeys] }
      : {}),
    ...(typeof adjustment.loyaltyMultiplier === 'number'
      ? { loyaltyMultiplier: adjustment.loyaltyMultiplier }
      : {}),
    ...(adjustment.snapshot ? { snapshot: { ...adjustment.snapshot } } : {}),
  };
}

export function createPromotionSnapshot(
  adjustments: readonly PromotionAdjustment[],
): PromotionSnapshotV1 {
  return {
    version: 1,
    adjustments: adjustments.map(snapshotAdjustment),
  };
}

function isSnapshotObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function resolvePromotionLoyaltyMultiplier(snapshot: unknown): number {
  if (!isSnapshotObject(snapshot) || snapshot.version !== 1) return 1;
  if (!Array.isArray(snapshot.adjustments)) return 1;

  const multiplier = snapshot.adjustments.reduce((value, adjustment) => {
    if (!isSnapshotObject(adjustment)) return value;
    if (
      adjustment.source !== 'LOYALTY_PROMOTION' ||
      adjustment.scope !== 'LOYALTY' ||
      typeof adjustment.loyaltyMultiplier !== 'number' ||
      !Number.isFinite(adjustment.loyaltyMultiplier) ||
      adjustment.loyaltyMultiplier < 1
    ) {
      return value;
    }
    return value * adjustment.loyaltyMultiplier;
  }, 1);

  return Math.max(1, Math.min(10, multiplier));
}
