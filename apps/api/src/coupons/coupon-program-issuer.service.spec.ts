import {
  couponRuleDiscountCents,
  couponRuleDiscountPercent,
  parseCouponUseRule,
} from './coupon-use-rule';

describe('percentage coupon issuance fields', () => {
  it('materializes percentage without a fixed discount amount', () => {
    const rule = parseCouponUseRule({
      type: 'PERCENT',
      applyTo: 'ORDER',
      percentOff: 10,
      constraints: { minSubtotalCents: 2000 },
    });

    expect({
      discountCents: couponRuleDiscountCents(rule),
      discountPercent: couponRuleDiscountPercent(rule),
    }).toEqual({
      discountCents: 0,
      discountPercent: 10,
    });
  });
});
