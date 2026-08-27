import { DateTime } from 'luxon';
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

const promotionNow = DateTime.fromISO('2026-08-21T12:00:00', {
  zone: 'America/Toronto',
});

const automaticTenPercentRule = {
  stableId: 'automatic-10',
  titleZh: '自动九折',
  titleEn: 'Automatic 10% off',
  type: 'PERCENTAGE_OFF' as const,
  status: 'ACTIVE' as const,
  priority: 175,
  stackingPolicy: 'STACKABLE' as const,
  excludesCoupons: false,
  excludesItemPromotions: false,
  channels: ['web' as const],
  validFrom: null,
  validTo: null,
  weekdays: [],
  startMinutes: null,
  endMinutes: null,
  config: { discountPercent: 10 },
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

  it('keeps custom-priced DailySpecial lines coupon-blocked without inventing a price discount', () => {
    const result = evaluateOrderPromotions({
      lines: [
        {
          lineKey: 'custom-special-line',
          productStableId: 'special-item',
          quantity: 1,
          baseUnitPriceCents: 949,
          lineTotalCents: 1200,
          dailySpecial: blockedDailySpecial,
          dailySpecialPriceApplied: false,
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
        lineKey: 'custom-special-line',
        discountCents: 0,
      }),
      expect.objectContaining({
        source: 'COUPON',
        discountCents: 100,
        applicableSubtotalCents: 1000,
      }),
    ]);
    expect(result.adjustments[0]?.snapshot).toEqual({
      pricingMode: 'OVERRIDE_PRICE',
      overridePriceCents: 799,
      discountDeltaCents: null,
      discountPercent: null,
      disallowCoupons: true,
      priceApplied: false,
    });
  });

  it('stacks an automatic promotion with a coupon when configured', () => {
    const result = evaluateOrderPromotions({
      lines: [
        {
          lineKey: 'regular-line',
          productStableId: 'regular-item',
          quantity: 1,
          baseUnitPriceCents: 1000,
          lineTotalCents: 1000,
        },
      ],
      promotionContext: {
        rules: [automaticTenPercentRule],
        now: promotionNow,
      },
      coupon: tenPercentCoupon,
    });

    expect(result.rejected).toEqual([]);
    expect(result.adjustments).toEqual([
      expect.objectContaining({
        source: 'AUTOMATIC_PROMOTION',
        discountCents: 100,
      }),
      expect.objectContaining({
        source: 'COUPON',
        discountCents: 100,
      }),
    ]);
  });

  it('keeps an already-materialized Daily Special ahead of a conflicting automatic rule', () => {
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
      ],
      promotionContext: {
        rules: [
          {
            ...automaticTenPercentRule,
            priority: 0,
            excludesItemPromotions: true,
            config: {
              discountPercent: 10,
              targetItemStableIds: ['special-item'],
            },
          },
        ],
        now: promotionNow,
      },
    });

    expect(result.adjustments).toEqual([
      expect.objectContaining({
        source: 'DAILY_SPECIAL',
        lineKey: 'special-line',
      }),
    ]);
    expect(result.rejected).toContainEqual(
      expect.objectContaining({
        source: 'AUTOMATIC_PROMOTION',
        code: 'STACKING_CONFLICT',
      }),
    );
  });

  it('lets an accepted automatic promotion remove its target lines from coupon eligibility', () => {
    const result = evaluateOrderPromotions({
      lines: [
        {
          lineKey: 'regular-line',
          productStableId: 'regular-item',
          quantity: 1,
          baseUnitPriceCents: 1000,
          lineTotalCents: 1000,
        },
      ],
      promotionContext: {
        rules: [
          {
            ...automaticTenPercentRule,
            excludesCoupons: true,
            config: {
              discountPercent: 10,
              targetItemStableIds: ['regular-item'],
            },
          },
        ],
        now: promotionNow,
      },
      coupon: tenPercentCoupon,
    });

    expect(result.couponEligibleSubtotalCents).toBe(0);
    expect(result.adjustments).toEqual([
      expect.objectContaining({
        source: 'AUTOMATIC_PROMOTION',
        discountCents: 100,
      }),
    ]);
    expect(result.rejected).toContainEqual(
      expect.objectContaining({
        source: 'COUPON',
        code: 'NO_APPLICABLE_SUBTOTAL',
      }),
    );
  });

  it('records POS manual discounts and loyalty multipliers in the same snapshot', () => {
    const result = evaluateOrderPromotions({
      lines: [
        {
          lineKey: 'regular-line',
          productStableId: 'regular-item',
          quantity: 1,
          baseUnitPriceCents: 1000,
          lineTotalCents: 1000,
        },
      ],
      promotionContext: {
        rules: [
          {
            ...automaticTenPercentRule,
            stableId: 'double-points',
            type: 'LOYALTY_MULTIPLIER',
            config: { multiplier: 2 },
          },
        ],
        now: promotionNow,
      },
      posDiscountCents: 150,
    });

    expect(result.adjustments).toEqual([
      expect.objectContaining({
        source: 'LOYALTY_PROMOTION',
        loyaltyMultiplier: 2,
      }),
      expect.objectContaining({
        source: 'POS_MANUAL_DISCOUNT',
        discountCents: 150,
      }),
    ]);
    expect(result.snapshot.adjustments).toEqual(result.adjustments);
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
