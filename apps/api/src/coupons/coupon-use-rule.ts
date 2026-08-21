import { Prisma } from '@prisma/client';
import { validateUseRule } from './coupon-program.utils';

export type CouponUseRule =
  | {
      type: 'FIXED_CENTS';
      applyTo: 'ORDER' | 'ITEM';
      amountCents: number;
      itemStableIds?: string[];
      constraints?: { minSubtotalCents?: number };
    }
  | {
      type: 'PERCENT';
      applyTo: 'ORDER' | 'ITEM';
      percentOff: number;
      itemStableIds?: string[];
      constraints?: { minSubtotalCents?: number };
    };

export function parseCouponUseRule(value: unknown): CouponUseRule {
  return validateUseRule(value) as unknown as CouponUseRule;
}

export function couponUseRuleSnapshot(
  rule: CouponUseRule,
): Prisma.InputJsonValue {
  return rule as unknown as Prisma.InputJsonValue;
}

export function resolveCouponRuleDiscountCents(
  rule: CouponUseRule,
  applicableSubtotalCents: number,
): number {
  if (applicableSubtotalCents <= 0) return 0;
  if (rule.type === 'PERCENT') {
    return Math.max(
      0,
      Math.min(
        applicableSubtotalCents,
        Math.round((applicableSubtotalCents * rule.percentOff) / 100),
      ),
    );
  }
  return Math.max(
    0,
    Math.min(rule.amountCents, applicableSubtotalCents),
  );
}

export function couponRuleItemStableIds(rule: CouponUseRule): string[] {
  return rule.applyTo === 'ITEM' ? (rule.itemStableIds ?? []) : [];
}

export function couponRuleMinSpendCents(rule: CouponUseRule): number | null {
  return typeof rule.constraints?.minSubtotalCents === 'number'
    ? rule.constraints.minSubtotalCents
    : null;
}
