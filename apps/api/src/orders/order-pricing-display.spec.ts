import { buildOrderPricingDisplay } from './order-pricing-display';

describe('buildOrderPricingDisplay', () => {
  it('restores daily-special savings into display subtotal while keeping named promotions and coupon separate from points', () => {
    const result = buildOrderPricingDisplay({
      effectiveSubtotalCents: 800,
      promotionSnapshot: {
        version: 1,
        adjustments: [
          {
            promotionStableId: 'daily-1',
            source: 'DAILY_SPECIAL',
            productStableId: 'item-1',
            discountCents: 200,
            snapshot: { pricingMode: 'OVERRIDE_PRICE' },
          },
          {
            promotionStableId: 'auto-1',
            source: 'AUTOMATIC_PROMOTION',
            discountCents: 100,
            snapshot: { titleZh: '买一送一', titleEn: 'Buy 1 Get 1 Free' },
          },
          {
            promotionStableId: 'coupon-1',
            source: 'COUPON',
            discountCents: 50,
            snapshot: { title: '新会员优惠券' },
          },
        ],
      },
      items: [
        {
          productStableId: 'item-1',
          displayName: '肉夹馍',
          nameZh: '肉夹馍',
          nameEn: 'Roujiamo',
        },
      ],
      couponTitleSnapshot: '新会员优惠券',
      couponDiscountCents: 50,
      loyaltyRedeemCents: 25,
      subtotalAfterDiscountCents: 625,
    });

    expect(result.displaySubtotalCents).toBe(1000);
    expect(result.discounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'DAILY_SPECIAL',
          productNameZh: '肉夹馍',
          productNameEn: 'Roujiamo',
          discountCents: 200,
        }),
        expect.objectContaining({
          source: 'AUTOMATIC_PROMOTION',
          titleZh: '买一送一',
          discountCents: 100,
        }),
        expect.objectContaining({
          source: 'COUPON',
          title: '新会员优惠券',
          discountCents: 50,
        }),
      ]),
    );
    expect(result.discounts).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ discountCents: 25 })]),
    );
  });

  it('uses the persisted line key to recover a daily-special item name when an older item id shape does not match the product stable id', () => {
    const result = buildOrderPricingDisplay({
      effectiveSubtotalCents: 800,
      promotionSnapshot: {
        version: 1,
        adjustments: [
          {
            promotionStableId: 'daily-legacy',
            source: 'DAILY_SPECIAL',
            lineKey: 'line-legacy',
            productStableId: 'product-stable',
            discountCents: 200,
            snapshot: { pricingMode: 'OVERRIDE_PRICE' },
          },
        ],
      },
      items: [
        {
          id: 'line-legacy',
          productStableId: 'legacy-internal-id',
          nameZh: '牛肉夹馍',
          nameEn: 'Beef Roujiamo',
        },
      ],
      subtotalAfterDiscountCents: 800,
    });

    expect(result.discounts).toEqual([
      expect.objectContaining({
        source: 'DAILY_SPECIAL',
        productNameZh: '牛肉夹馍',
        productNameEn: 'Beef Roujiamo',
        discountCents: 200,
      }),
    ]);
    expect(result.displaySubtotalCents).toBe(1000);
  });

  it('keeps historical coupon data and exposes an unattributed legacy discount instead of dropping it', () => {
    const result = buildOrderPricingDisplay({
      effectiveSubtotalCents: 1000,
      promotionSnapshot: null,
      items: [],
      couponTitleSnapshot: '历史优惠券',
      couponDiscountCents: 100,
      loyaltyRedeemCents: 50,
      subtotalAfterDiscountCents: 750,
    });

    expect(result.displaySubtotalCents).toBe(1000);
    expect(result.discounts).toEqual([
      expect.objectContaining({
        source: 'COUPON',
        title: '历史优惠券',
        discountCents: 100,
      }),
      expect.objectContaining({
        source: 'OTHER',
        discountCents: 100,
      }),
    ]);
  });
});
