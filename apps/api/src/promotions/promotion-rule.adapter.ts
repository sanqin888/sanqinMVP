import { DateTime } from 'luxon';
import {
  resolvePromotionDiscountCents,
  type PromotionCandidate,
  type PromotionEligibility,
  type PromotionStackingGroup,
} from './promotion-engine';

export type PromotionRuleType =
  | 'PERCENTAGE_OFF'
  | 'FIXED_AMOUNT_OFF'
  | 'BUY_X_GET_Y'
  | 'FREE_ITEM'
  | 'LOYALTY_MULTIPLIER';

export type PromotionRuleLike = {
  stableId: string;
  titleZh: string;
  titleEn: string | null;
  type: PromotionRuleType;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED';
  priority: number;
  stackingPolicy: 'EXCLUSIVE' | 'STACKABLE';
  excludesCoupons: boolean;
  excludesItemPromotions: boolean;
  channels: Array<'web' | 'in_store' | 'ubereats'>;
  validFrom: Date | null;
  validTo: Date | null;
  weekdays: number[];
  startMinutes: number | null;
  endMinutes: number | null;
  config: unknown;
};

export type PromotionRuleOrderLine = {
  lineKey: string;
  productStableId: string;
  quantity: number;
  lineTotalCents: number;
};

type JsonObject = Record<string, unknown>;

type UnitReward = {
  lineKey: string;
  productStableId: string;
  unitPriceCents: number;
};

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(
  record: JsonObject,
  key: string,
  options?: { min?: number; max?: number; integer?: boolean },
): number | null {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const normalized = options?.integer ? Math.round(value) : value;
  if (typeof options?.min === 'number' && normalized < options.min) return null;
  if (typeof options?.max === 'number' && normalized > options.max) return null;
  return normalized;
}

function readStringArray(record: JsonObject, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function normalizeQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function resolveStoreCalendarDate(value: Date, zoneName: string): DateTime {
  return DateTime.fromObject(
    {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
    },
    { zone: zoneName },
  );
}

export function isPromotionRuleActiveNow(
  rule: PromotionRuleLike,
  now: DateTime,
): boolean {
  if (rule.status !== 'ACTIVE') return false;

  const zoneName = now.zoneName ?? 'UTC';
  const startDate = rule.validFrom
    ? resolveStoreCalendarDate(rule.validFrom, zoneName).startOf('day')
    : null;
  const endDate = rule.validTo
    ? resolveStoreCalendarDate(rule.validTo, zoneName).endOf('day')
    : null;
  if (startDate && now < startDate) return false;
  if (endDate && now > endDate) return false;

  if (rule.weekdays.length > 0 && !rule.weekdays.includes(now.weekday)) {
    return false;
  }

  const minutes = now.hour * 60 + now.minute;
  if (
    typeof rule.startMinutes === 'number' &&
    typeof rule.endMinutes === 'number'
  ) {
    if (rule.endMinutes < rule.startMinutes) return false;
    return minutes >= rule.startMinutes && minutes <= rule.endMinutes;
  }
  if (typeof rule.startMinutes === 'number') {
    return minutes >= rule.startMinutes;
  }
  if (typeof rule.endMinutes === 'number') {
    return minutes <= rule.endMinutes;
  }
  return true;
}

function targetLines(
  lines: readonly PromotionRuleOrderLine[],
  itemStableIds: readonly string[],
): PromotionRuleOrderLine[] {
  if (itemStableIds.length === 0) return [...lines];
  const targetSet = new Set(itemStableIds);
  return lines.filter((line) => targetSet.has(line.productStableId));
}

function sumLineTotals(lines: readonly PromotionRuleOrderLine[]): number {
  return lines.reduce(
    (sum, line) => sum + normalizeCents(line.lineTotalCents),
    0,
  );
}

function eligibilityForSpend(params: {
  active: boolean;
  applicableSubtotalCents: number;
  orderSubtotalCents: number;
  minSpendCents: number | null;
}): PromotionEligibility {
  if (!params.active) {
    return {
      eligible: false,
      code: 'INACTIVE',
      reason: 'promotion is inactive',
    };
  }
  if (params.applicableSubtotalCents <= 0) {
    return {
      eligible: false,
      code: 'NO_APPLICABLE_SUBTOTAL',
      reason: 'promotion has no applicable order lines',
    };
  }
  if (
    typeof params.minSpendCents === 'number' &&
    params.orderSubtotalCents < params.minSpendCents
  ) {
    return {
      eligible: false,
      code: 'MIN_SPEND_NOT_MET',
      reason: 'order subtotal does not meet promotion rules',
    };
  }
  return { eligible: true, code: 'ELIGIBLE' };
}

function excludedGroups(rule: PromotionRuleLike): PromotionStackingGroup[] {
  const groups: PromotionStackingGroup[] = [];
  if (rule.excludesCoupons) groups.push('COUPON');
  if (rule.excludesItemPromotions) groups.push('ITEM_PRICE');
  return groups;
}

function baseCandidate(params: {
  rule: PromotionRuleLike;
  eligibility: PromotionEligibility;
  benefit: PromotionCandidate['benefit'];
  source?: 'AUTOMATIC_PROMOTION' | 'LOYALTY_PROMOTION';
}): PromotionCandidate {
  return {
    promotionStableId: params.rule.stableId,
    source: params.source ?? 'AUTOMATIC_PROMOTION',
    // Daily Specials are materialized into line prices before this order-level
    // evaluation runs. Keep all persisted rule candidates behind their fixed
    // priority (100) so a rule can stack with or lose to an applied special,
    // but can never "win" by rejecting a price that has already been applied.
    priority: Math.max(101, params.rule.priority),
    eligibility: params.eligibility,
    stacking: {
      group:
        params.source === 'LOYALTY_PROMOTION'
          ? 'LOYALTY_BONUS'
          : 'AUTOMATIC_DISCOUNT',
      mode: params.rule.stackingPolicy,
      excludesGroups: excludedGroups(params.rule),
    },
    benefit: params.benefit,
    snapshot: {
      ruleType: params.rule.type,
      titleZh: params.rule.titleZh,
      titleEn: params.rule.titleEn,
      stackingPolicy: params.rule.stackingPolicy,
    },
  };
}

function buildUnitRewards(
  lines: readonly PromotionRuleOrderLine[],
): UnitReward[] {
  const rewards: UnitReward[] = [];
  for (const line of lines) {
    const quantity = normalizeQuantity(line.quantity);
    if (quantity <= 0) continue;
    const lineTotalCents = normalizeCents(line.lineTotalCents);
    const unitPriceCents = Math.max(0, Math.round(lineTotalCents / quantity));
    for (let index = 0; index < quantity; index += 1) {
      rewards.push({
        lineKey: line.lineKey,
        productStableId: line.productStableId,
        unitPriceCents,
      });
    }
  }
  return rewards.sort((left, right) => {
    if (left.unitPriceCents !== right.unitPriceCents) {
      return left.unitPriceCents - right.unitPriceCents;
    }
    return left.lineKey.localeCompare(right.lineKey);
  });
}

function resolveRewardDiscount(params: {
  rewards: readonly UnitReward[];
  quantity: number;
  discountPercent: number;
}): { discountCents: number; targetLineKeys: string[] } {
  const selected = params.rewards.slice(0, Math.max(0, params.quantity));
  const discountCents = selected.reduce(
    (sum, reward) =>
      sum + Math.round((reward.unitPriceCents * params.discountPercent) / 100),
    0,
  );
  return {
    discountCents: normalizeCents(discountCents),
    targetLineKeys: Array.from(
      new Set(selected.map((reward) => reward.lineKey)),
    ),
  };
}

function buildPercentageCandidate(params: {
  rule: PromotionRuleLike;
  config: JsonObject;
  lines: readonly PromotionRuleOrderLine[];
  orderSubtotalCents: number;
  active: boolean;
}): PromotionCandidate {
  const itemStableIds = readStringArray(params.config, 'targetItemStableIds');
  const applicableLines = targetLines(params.lines, itemStableIds);
  const applicableSubtotalCents = sumLineTotals(applicableLines);
  const minSpendCents = readNumber(params.config, 'minSpendCents', {
    min: 0,
    integer: true,
  });
  const percent =
    readNumber(params.config, 'discountPercent', {
      min: 0,
      max: 100,
      integer: true,
    }) ?? 0;
  return baseCandidate({
    rule: params.rule,
    eligibility: eligibilityForSpend({
      active: params.active,
      applicableSubtotalCents,
      orderSubtotalCents: params.orderSubtotalCents,
      minSpendCents,
    }),
    benefit: {
      type: 'ORDER_DISCOUNT',
      applicableSubtotalCents,
      discountCents: resolvePromotionDiscountCents({
        fixedDiscountCents: 0,
        discountPercent: percent,
        applicableSubtotalCents,
      }),
      targetLineKeys: applicableLines.map((line) => line.lineKey),
    },
  });
}

function buildFixedCandidate(params: {
  rule: PromotionRuleLike;
  config: JsonObject;
  lines: readonly PromotionRuleOrderLine[];
  orderSubtotalCents: number;
  active: boolean;
}): PromotionCandidate {
  const itemStableIds = readStringArray(params.config, 'targetItemStableIds');
  const applicableLines = targetLines(params.lines, itemStableIds);
  const applicableSubtotalCents = sumLineTotals(applicableLines);
  const minSpendCents = readNumber(params.config, 'minSpendCents', {
    min: 0,
    integer: true,
  });
  const fixedDiscountCents =
    readNumber(params.config, 'discountCents', { min: 0, integer: true }) ?? 0;
  return baseCandidate({
    rule: params.rule,
    eligibility: eligibilityForSpend({
      active: params.active,
      applicableSubtotalCents,
      orderSubtotalCents: params.orderSubtotalCents,
      minSpendCents,
    }),
    benefit: {
      type: 'ORDER_DISCOUNT',
      applicableSubtotalCents,
      discountCents: resolvePromotionDiscountCents({
        fixedDiscountCents,
        applicableSubtotalCents,
      }),
      targetLineKeys: applicableLines.map((line) => line.lineKey),
    },
  });
}

function buildFreeItemCandidate(params: {
  rule: PromotionRuleLike;
  config: JsonObject;
  lines: readonly PromotionRuleOrderLine[];
  orderSubtotalCents: number;
  active: boolean;
}): PromotionCandidate {
  const itemStableIds = readStringArray(params.config, 'itemStableIds');
  const applicableLines = targetLines(params.lines, itemStableIds);
  const applicableSubtotalCents = sumLineTotals(applicableLines);
  const minSpendCents = readNumber(params.config, 'minSpendCents', {
    min: 0,
    integer: true,
  });
  const quantity =
    readNumber(params.config, 'quantity', { min: 1, integer: true }) ?? 1;
  const reward = resolveRewardDiscount({
    rewards: buildUnitRewards(applicableLines),
    quantity,
    discountPercent: 100,
  });
  return baseCandidate({
    rule: params.rule,
    eligibility: eligibilityForSpend({
      active: params.active,
      applicableSubtotalCents: reward.discountCents,
      orderSubtotalCents: params.orderSubtotalCents,
      minSpendCents,
    }),
    benefit: {
      type: 'ORDER_DISCOUNT',
      applicableSubtotalCents,
      discountCents: reward.discountCents,
      targetLineKeys: reward.targetLineKeys,
    },
  });
}

function buildBuyXGetYCandidate(params: {
  rule: PromotionRuleLike;
  config: JsonObject;
  lines: readonly PromotionRuleOrderLine[];
  orderSubtotalCents: number;
  active: boolean;
}): PromotionCandidate {
  const buyItemStableIds = readStringArray(params.config, 'buyItemStableIds');
  const getItemStableIds = readStringArray(params.config, 'getItemStableIds');
  const buyQuantity =
    readNumber(params.config, 'buyQuantity', { min: 1, integer: true }) ?? 1;
  const getQuantity =
    readNumber(params.config, 'getQuantity', { min: 1, integer: true }) ?? 1;
  const discountPercent =
    readNumber(params.config, 'discountPercent', {
      min: 0,
      max: 100,
      integer: true,
    }) ?? 100;
  const minSpendCents = readNumber(params.config, 'minSpendCents', {
    min: 0,
    integer: true,
  });

  const buyLines = targetLines(params.lines, buyItemStableIds);
  const getLines = targetLines(params.lines, getItemStableIds);
  const buySet = new Set(buyItemStableIds);
  const getSet = new Set(getItemStableIds);
  const sameTargets =
    buySet.size === getSet.size &&
    [...buySet].every((item) => getSet.has(item));
  const buyUnits = buyLines.reduce(
    (sum, line) => sum + normalizeQuantity(line.quantity),
    0,
  );
  const getUnits = getLines.reduce(
    (sum, line) => sum + normalizeQuantity(line.quantity),
    0,
  );

  const qualifyingSets = sameTargets
    ? Math.floor(buyUnits / (buyQuantity + getQuantity))
    : Math.floor(buyUnits / buyQuantity);
  const rewardQuantity = Math.min(getUnits, qualifyingSets * getQuantity);
  const reward = resolveRewardDiscount({
    rewards: buildUnitRewards(getLines),
    quantity: rewardQuantity,
    discountPercent,
  });
  const applicableSubtotalCents = sumLineTotals(getLines);
  const eligibility = eligibilityForSpend({
    active: params.active,
    applicableSubtotalCents: reward.discountCents,
    orderSubtotalCents: params.orderSubtotalCents,
    minSpendCents,
  });

  return baseCandidate({
    rule: params.rule,
    eligibility,
    benefit: {
      type: 'ORDER_DISCOUNT',
      applicableSubtotalCents,
      discountCents: reward.discountCents,
      targetLineKeys: reward.targetLineKeys,
    },
  });
}

function buildLoyaltyMultiplierCandidate(params: {
  rule: PromotionRuleLike;
  config: JsonObject;
  orderSubtotalCents: number;
  active: boolean;
}): PromotionCandidate {
  const multiplier =
    readNumber(params.config, 'multiplier', { min: 1, max: 10 }) ?? 1;
  const minSpendCents = readNumber(params.config, 'minSpendCents', {
    min: 0,
    integer: true,
  });
  const eligible =
    params.active &&
    (minSpendCents === null || params.orderSubtotalCents >= minSpendCents);
  const eligibility: PromotionEligibility = !params.active
    ? { eligible: false, code: 'INACTIVE', reason: 'promotion is inactive' }
    : eligible
      ? { eligible: true, code: 'ELIGIBLE' }
      : {
          eligible: false,
          code: 'MIN_SPEND_NOT_MET',
          reason: 'order subtotal does not meet promotion rules',
        };

  return baseCandidate({
    rule: params.rule,
    source: 'LOYALTY_PROMOTION',
    eligibility,
    benefit: { type: 'LOYALTY_MULTIPLIER', multiplier },
  });
}

export function toPromotionRuleCandidate(params: {
  rule: PromotionRuleLike;
  lines: readonly PromotionRuleOrderLine[];
  now: DateTime;
}): PromotionCandidate {
  const config = isRecord(params.rule.config) ? params.rule.config : {};
  const orderSubtotalCents = sumLineTotals(params.lines);
  const active = isPromotionRuleActiveNow(params.rule, params.now);

  switch (params.rule.type) {
    case 'PERCENTAGE_OFF':
      return buildPercentageCandidate({
        rule: params.rule,
        config,
        lines: params.lines,
        orderSubtotalCents,
        active,
      });
    case 'FIXED_AMOUNT_OFF':
      return buildFixedCandidate({
        rule: params.rule,
        config,
        lines: params.lines,
        orderSubtotalCents,
        active,
      });
    case 'BUY_X_GET_Y':
      return buildBuyXGetYCandidate({
        rule: params.rule,
        config,
        lines: params.lines,
        orderSubtotalCents,
        active,
      });
    case 'FREE_ITEM':
      return buildFreeItemCandidate({
        rule: params.rule,
        config,
        lines: params.lines,
        orderSubtotalCents,
        active,
      });
    case 'LOYALTY_MULTIPLIER':
      return buildLoyaltyMultiplierCandidate({
        rule: params.rule,
        config,
        orderSubtotalCents,
        active,
      });
  }
}
