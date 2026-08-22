import { evaluateCouponPromotion } from './coupon-promotion.adapter';
import { toDailySpecialPromotionCandidate } from './daily-special-promotion.adapter';
import {
  createPromotionSnapshot,
  resolvePromotionCandidates,
  resolvePromotionDiscountCents,
  resolvePromotionLinePriceCents,
} from './promotion-engine';

describe('Promotion Engine', () => {
  it('preserves DailySpecial line-price calculation semantics', () => {
    expect(
      resolvePromotionLinePriceCents({
        basePriceCents: 1399,
        pricingMode: 'OVERRIDE_PRICE',
        overridePriceCents: 1249,
      }),
    ).toBe(1249);
    expect(
      resolvePromotionLinePriceCents({
        basePriceCents: 1399,
        pricingMode: 'DISCOUNT_DELTA',
        discountDeltaCents: 150,
      }),
    ).toBe(1249);
    expect(
      resolvePromotionLinePriceCents({
        basePriceCents: 1000,
        pricingMode: 'DISCOUNT_PERCENT',
        discountPercent: 15,
      }),
    ).toBe(850);
  });

  it('preserves issued coupon fixed and percentage discount semantics', () => {
    expect(
      resolvePromotionDiscountCents({
        fixedDiscountCents: 500,
        applicableSubtotalCents: 300,
      }),
    ).toBe(300);
    expect(
      resolvePromotionDiscountCents({
        fixedDiscountCents: 0,
        discountPercent: 10,
        applicableSubtotalCents: 3333,
      }),
    ).toBe(333);
  });

  it('uses DailySpecial disallowCoupons as a line-level stacking rule', () => {
    const dailySpecial = toDailySpecialPromotionCandidate({
      special: {
        stableId: 'daily-1',
        pricingMode: 'OVERRIDE_PRICE',
        overridePriceCents: 799,
        discountDeltaCents: null,
        discountPercent: null,
        disallowCoupons: true,
      },
      lineKey: 'line-1',
      productStableId: 'item-1',
      quantity: 1,
      baseUnitPriceCents: 949,
    });
    const coupon = evaluateCouponPromotion({
      coupon: {
        couponStableId: 'coupon-1',
        code: 'SAVE10',
        title: 'Save 10%',
        discountCents: 0,
        discountPercent: 10,
        stackingPolicy: 'STACKABLE',
      },
      subtotalCents: 799,
      couponEligibleLineItems: [
        {
          lineKey: 'line-1',
          productStableId: 'item-1',
          lineTotalCents: 799,
        },
      ],
    }).candidate;

    const result = resolvePromotionCandidates([dailySpecial, coupon]);

    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0]).toMatchObject({
      source: 'DAILY_SPECIAL',
      discountCents: 150,
    });
    expect(result.rejected).toContainEqual(
      expect.objectContaining({
        source: 'COUPON',
        code: 'STACKING_CONFLICT',
      }),
    );
  });

  it('allows coupon stacking on a DailySpecial line when configured', () => {
    const dailySpecial = toDailySpecialPromotionCandidate({
      special: {
        stableId: 'daily-1',
        pricingMode: 'OVERRIDE_PRICE',
        overridePriceCents: 799,
        discountDeltaCents: null,
        discountPercent: null,
        disallowCoupons: false,
      },
      lineKey: 'line-1',
      productStableId: 'item-1',
      quantity: 1,
      baseUnitPriceCents: 949,
    });
    const coupon = evaluateCouponPromotion({
      coupon: {
        couponStableId: 'coupon-1',
        code: 'SAVE10',
        title: 'Save 10%',
        discountCents: 0,
        discountPercent: 10,
        stackingPolicy: 'STACKABLE',
      },
      subtotalCents: 799,
      couponEligibleLineItems: [
        {
          lineKey: 'line-1',
          productStableId: 'item-1',
          lineTotalCents: 799,
        },
      ],
    }).candidate;

    const result = resolvePromotionCandidates([dailySpecial, coupon]);

    expect(result.rejected).toEqual([]);
    expect(result.adjustments).toEqual([
      expect.objectContaining({
        source: 'DAILY_SPECIAL',
        discountCents: 150,
      }),
      expect.objectContaining({
        source: 'COUPON',
        discountCents: 80,
      }),
    ]);
  });

  it('evaluates item-scoped coupon subtotal and min-spend before adjustment', () => {
    const evaluation = evaluateCouponPromotion({
      coupon: {
        couponStableId: 'coupon-1',
        code: 'ITEM500',
        title: 'Item coupon',
        discountCents: 500,
        minSpendCents: 1000,
        unlockedItemStableIds: ['item-2'],
        stackingPolicy: 'EXCLUSIVE',
      },
      subtotalCents: 2500,
      couponEligibleLineItems: [
        { lineKey: 'line-1', productStableId: 'item-1', lineTotalCents: 1500 },
        { lineKey: 'line-2', productStableId: 'item-2', lineTotalCents: 900 },
      ],
    });

    expect(evaluation.applicableSubtotalCents).toBe(900);
    expect(evaluation.candidate.eligibility).toEqual({
      eligible: false,
      code: 'MIN_SPEND_NOT_MET',
      reason: 'order subtotal does not meet coupon rules',
    });
    expect(resolvePromotionCandidates([evaluation.candidate]).adjustments).toEqual(
      [],
    );
  });

  it('resolves exclusive candidates deterministically within a stacking group', () => {
    const first = evaluateCouponPromotion({
      coupon: {
        couponStableId: 'coupon-first',
        code: 'FIRST',
        title: 'First',
        discountCents: 100,
        stackingPolicy: 'EXCLUSIVE',
      },
      subtotalCents: 1000,
    }).candidate;
    const second = evaluateCouponPromotion({
      coupon: {
        couponStableId: 'coupon-second',
        code: 'SECOND',
        title: 'Second',
        discountCents: 200,
        stackingPolicy: 'STACKABLE',
      },
      subtotalCents: 1000,
    }).candidate;

    const result = resolvePromotionCandidates([first, second]);

    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0].promotionStableId).toBe('coupon-first');
    expect(result.rejected).toContainEqual(
      expect.objectContaining({
        promotionStableId: 'coupon-second',
        code: 'STACKING_CONFLICT',
      }),
    );
  });

  it('creates a versioned immutable-order snapshot shape', () => {
    const candidate = evaluateCouponPromotion({
      coupon: {
        couponStableId: 'coupon-1',
        code: 'SAVE5',
        title: 'Save $5',
        discountCents: 500,
      },
      subtotalCents: 1200,
    }).candidate;
    const resolution = resolvePromotionCandidates([candidate]);

    expect(createPromotionSnapshot(resolution.adjustments)).toEqual({
      version: 1,
      adjustments: [
        expect.objectContaining({
          promotionStableId: 'coupon-1',
          source: 'COUPON',
          scope: 'ORDER',
          discountCents: 500,
        }),
      ],
    });
  });
});
