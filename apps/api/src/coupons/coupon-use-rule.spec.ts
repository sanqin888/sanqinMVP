import { resolveIssuedCouponDiscountCents } from './coupon-use-rule';

describe('coupon discount resolution', () => {
  it('keeps fixed-amount coupons unchanged', () => {
    expect(resolveIssuedCouponDiscountCents(500, null, 3200)).toBe(500);
  });

  it('calculates percentage coupons from the applicable subtotal', () => {
    expect(resolveIssuedCouponDiscountCents(0, 15, 3200)).toBe(480);
  });

  it('clamps discounts to the applicable subtotal', () => {
    expect(resolveIssuedCouponDiscountCents(5000, null, 1200)).toBe(1200);
    expect(resolveIssuedCouponDiscountCents(0, 100, 1200)).toBe(1200);
  });
});
