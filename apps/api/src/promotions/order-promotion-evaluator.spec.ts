import { evaluateOrderPromotions } from './order-promotion-evaluator';

const blockedDailySpecial = {
  stableId: 'daily-blocked',
  pricingMode: 'OVERRIDE_PRICE' as const,
  overridePriceCents: 799,
  discountDeltaCents: null,
  discountPercent: null,
  disallowCoupons: true,
};

const stackableDailySpecial = {
  ...blockedDailySpecial,
  stableId: 'daily-stackable',
  disallowCoupons: false,
};

const tenPercentCoupon = {
  couponStableId: 'coupon-10',
  code: 'SAVE10',
  title: 'Save 10%',
  discountCents: 0,
  discountPercent: 10,
  stackingPolicy: 'STACKABLE' as const,
};

describe('order promotion evaluator', () => {
  it('excludes only a non-stackable DailySpecial line from coupon subtotal', () => {
    const result = evaluateOrderPromotions({
      lines: [
        {
          lineKey: 'special-line',
          productStableId: 'special-item',
          quantity: 1,
          baseUnitPriceCents: 949,
          lineTotalCents: 799,
          dailySpecial: blockedDailySpecial,
        },
        {
          lineKey: 'regular-line',
          productStableId: 'regular-item',
          quantity: 1,
          baseUnitPriceCents: 1000,
          lineTotalCents: 1000,
        },
      ],
      coupon: tenPercentCoupon,
    });

    expect(result.couponEligibleSubtotalCents).toBe(1000);
    expect(result.couponEligibleLineKeys).toEqual(['regular-line']);
    expect(result.adjustments).toEqual([
      expect.objectContaining({
        source: 'DAILY_SPECIAL',
        lineKey: 'special-line',
        discountCents: 150,
      }),
      expect.objectContaining({
        source: 'COUPON',
        discountCents: 100,
        applicableSubtotalCents: 1000,
        targetLineKeys: ['regular-line'],
      }),
    ]);
  });

  it('includes a stackable DailySpecial line in coupon subtotal', () => {
    const result = evaluateOrderPromotions({
      lines: [
        {
          lineKey: 'special-line',
          productStableId: 'special-item',
          quantity: 1,
          baseUnitPriceCents: 949,
          lineTotalCents: 799,
          dailySpecial: stackableDailySpecial,
        },
        {
          lineKey: 'regular-line',
          productStableId: 'regular-item',
          quantity: 1,
          baseUnitPriceCents: 1000,
          lineTotalCents: 1000,
        },
      ],
      coupon: tenPercentCoupon,
    });

    expect(result.couponEligibleSubtotalCents).toBe(1799);
    expect(result.couponEligibleLineKeys).toEqual([
      'special-line',
      'regular-line',
    ]);
    expect(result.adjustments).toEqual([
      expect.objectContaining({
        source: 'DAILY_SPECIAL',
        discountCents: 150,
      }),
      expect.objectContaining({
        source: 'COUPON',
        discountCents: 180,
        applicableSubtotalCents: 1799,
      }),
    ]);
  });

  it('rejects an item-scoped coupon when its only target line blocks coupons', () => {
    const result = evaluateOrderPromotions({
      lines: [
        {
          lineKey: 'special-line',
          productStableId: 'special-item',
          quantity: 1,
          baseUnitPriceCents: 949,
          lineTotalCents: 799,
          dailySpecial: blockedDailySpecial,
        },
        {
          lineKey: 'regular-line',
          productStableId: 'regular-item',
          quantity: 1,
          baseUnitPriceCents: 1000,
          lineTotalCents: 1000,
        },
      ],
      coupon: {
        ...tenPercentCoupon,
        couponStableId: 'coupon-special-only',
        unlockedItemStableIds: ['special-item'],
      },
    });

    expect(result.adjustments).toEqual([
      expect.objectContaining({ source: 'DAILY_SPECIAL' }),
    ]);
    expect(result.rejected).toContainEqual(
      expect.objectContaining({
        promotionStableId: 'coupon-special-only',
        code: 'NO_APPLICABLE_SUBTOTAL',
      }),
    );
  });

  it('returns the same adjustments in its versioned order snapshot', () => {
    const result = evaluateOrderPromotions({
      lines: [
        {
          lineKey: 'regular-line',
          productStableId: 'regular-item',
          quantity: 1,
          baseUnitPriceCents: 1200,
          lineTotalCents: 1200,
        },
      ],
      coupon: {
        ...tenPercentCoupon,
        discountPercent: undefined,
        discountCents: 500,
      },
    });

    expect(result.snapshot.version).toBe(1);
    expect(result.snapshot.adjustments).toEqual(result.adjustments);
    expect(result.snapshot.adjustments).not.toBe(result.adjustments);
  });
});
