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

export function resolveCouponRuleDiscountCents(
  rule: CouponUseRule,
  applicableSubtotalCents: number,
): number {
  return resolveIssuedCouponDiscountCents(
    rule.type === 'FIXED_CENTS' ? rule.amountCents : 0,
    rule.type === 'PERCENT' ? rule.percentOff : null,
    applicableSubtotalCents,
  );
}

export function resolveIssuedCouponDiscountCents(
  discountCents: number,
  discountPercent: number | null | undefined,
  applicableSubtotalCents: number,
): number {
  const subtotal = Math.max(0, Math.round(applicableSubtotalCents));
  if (subtotal === 0) return 0;

  if (typeof discountPercent === 'number') {
    const percent = Math.max(0, Math.min(100, Math.round(discountPercent)));
    return Math.min(subtotal, Math.round((subtotal * percent) / 100));
  }

  return Math.max(0, Math.min(Math.round(discountCents), subtotal));
}

export function couponRuleDiscountCents(rule: CouponUseRule): number {
  return rule.type === 'FIXED_CENTS' ? rule.amountCents : 0;
}

export function couponRuleDiscountPercent(rule: CouponUseRule): number | null {
  return rule.type === 'PERCENT' ? rule.percentOff : null;
}

export function couponRuleItemStableIds(rule: CouponUseRule): string[] {
  return rule.applyTo === 'ITEM' ? (rule.itemStableIds ?? []) : [];
}

export function couponRuleMinSpendCents(rule: CouponUseRule): number | null {
  return typeof rule.constraints?.minSubtotalCents === 'number'
    ? rule.constraints.minSubtotalCents
    : null;
}
