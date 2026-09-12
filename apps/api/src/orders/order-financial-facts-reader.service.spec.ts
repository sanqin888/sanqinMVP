import { OrderStatus } from '@prisma/client';

import { OrderFinancialFactsReaderService } from './order-financial-facts-reader.service';
import {
  buildOrderFinancialFactV1,
  serializeOrderFinancialFactV1,
} from './order-financial-sale-fact';

const financialRow = (overrides: Record<string, unknown> = {}) => ({
  orderStableId: 'order-stable-1',
  storeId: '4750_Yonge_Street',
  paidAt: new Date('2026-09-12T14:00:00.000Z'),
  updatedAt: new Date('2026-09-12T14:05:00.000Z'),
  channel: 'in_store',
  paymentMethod: 'CARD',
  subtotalCents: 800,
  subtotalAfterDiscountCents: 525,
  couponDiscountCents: 100,
  loyaltyRedeemCents: 25,
  taxCents: 68,
  deliveryFeeCents: 100,
  creditCardSurchargeCents: 20,
  totalCents: 693,
  paymentTotalCents: 713,
  couponTitleSnapshot: 'Coupon',
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
        promotionStableId: 'coupon-1',
        source: 'COUPON',
        discountCents: 100,
        snapshot: { title: 'Coupon' },
      },
      {
        promotionStableId: 'auto-1',
        source: 'AUTOMATIC_PROMOTION',
        discountCents: 100,
        snapshot: { title: 'BOGO' },
      },
      {
        promotionStableId: 'manual-1',
        source: 'POS_MANUAL_DISCOUNT',
        discountCents: 50,
        snapshot: { title: 'Staff discount' },
      },
    ],
  },
  items: [
    {
      id: 'line-1',
      productStableId: 'item-1',
      displayName: 'Roujiamo',
      nameZh: '肉夹馍',
      nameEn: 'Roujiamo',
      qty: 2,
      unitPriceCents: 400,
      baseUnitPriceCents: 400,
      optionsUnitPriceCents: 0,
      isDailySpecialApplied: true,
      dailySpecialStableId: 'daily-1',
    },
  ],
  ...overrides,
});

const legacyService = (order: Record<string, unknown>) =>
  new OrderFinancialFactsReaderService({
    opsEvent: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    order,
  } as never);

describe('OrderFinancialFactsReaderService', () => {
  it('normalizes legacy persisted pricing while marking the mutable Order-row source explicitly', async () => {
    const findFirst = jest.fn().mockResolvedValue(financialRow());
    const service = legacyService({ findFirst });

    await expect(
      service.readFactByOrderStableId(' order-stable-1 '),
    ).resolves.toEqual({
      version: 1,
      factStableId: 'order-stable-1',
      orderStableId: 'order-stable-1',
      storeStableId: '4750_Yonge_Street',
      occurredAt: new Date('2026-09-12T14:00:00.000Z'),
      sourceUpdatedAt: new Date('2026-09-12T14:05:00.000Z'),
      sourceEvidence: 'LEGACY_CURRENT_ORDER',
      channel: 'in_store',
      paymentMethod: 'CARD',
      itemQuantity: 2,
      currency: 'CAD',
      pricingEvidence: 'COMPLETE',
      nominalSubtotalCents: 1000,
      effectiveSubtotalCents: 800,
      discounts: {
        dailySpecialCents: 200,
        couponCents: 100,
        automaticPromotionCents: 100,
        posManualCents: 50,
        pointsRedemptionCents: 25,
        unattributedLegacyCents: 0,
        totalCents: 475,
      },
      subtotalAfterDiscountCents: 525,
      taxCents: 68,
      deliveryRevenueCents: 100,
      cardSurchargeCents: 20,
      orderTotalCents: 693,
      paymentTotalCents: 713,
    });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orderStableId: 'order-stable-1',
          status: {
            in: expect.arrayContaining([
              OrderStatus.paid,
              OrderStatus.refunded,
            ]),
          },
        },
      }),
    );
  });

  it('prefers the immutable sale fact after a later mutable Order row has changed', async () => {
    const original = buildOrderFinancialFactV1(
      financialRow() as never,
      'IMMUTABLE_SALE_SNAPSHOT',
    );
    const findFirst = jest.fn().mockResolvedValue(
      financialRow({
        subtotalCents: 1_500,
        subtotalAfterDiscountCents: 1_500,
        totalCents: 1_695,
      }),
    );
    const service = new OrderFinancialFactsReaderService({
      opsEvent: {
        findUnique: jest.fn().mockResolvedValue({
          payload: serializeOrderFinancialFactV1(original),
        }),
      },
      order: { findFirst },
    } as never);

    const fact = await service.readFactByOrderStableId('order-stable-1');

    expect(fact?.sourceEvidence).toBe('IMMUTABLE_SALE_SNAPSHOT');
    expect(fact?.effectiveSubtotalCents).toBe(800);
    expect(fact?.orderTotalCents).toBe(693);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('recovers POS Daily Special gross price from immutable base/override evidence when the promotion snapshot recorded zero discount', async () => {
    const service = legacyService({
      findFirst: jest.fn().mockResolvedValue(
        financialRow({
          subtotalCents: 799,
          subtotalAfterDiscountCents: 799,
          couponDiscountCents: 0,
          loyaltyRedeemCents: 0,
          promotionSnapshot: {
            version: 1,
            adjustments: [
              {
                promotionStableId: 'daily-1',
                source: 'DAILY_SPECIAL',
                productStableId: 'item-1',
                quantity: 1,
                baseUnitPriceCents: 949,
                discountCents: 0,
                snapshot: {
                  pricingMode: 'OVERRIDE_PRICE',
                  overridePriceCents: 799,
                },
              },
            ],
          },
          items: [
            {
              id: 'line-1',
              productStableId: 'item-1',
              displayName: 'Roujiamo',
              nameZh: '肉夹馍',
              nameEn: 'Roujiamo',
              qty: 1,
              unitPriceCents: 799,
              baseUnitPriceCents: 799,
              optionsUnitPriceCents: 0,
              isDailySpecialApplied: true,
              dailySpecialStableId: 'daily-1',
            },
          ],
        }),
      ),
    });

    const fact = await service.readFactByOrderStableId('order-stable-1');

    expect(fact?.pricingEvidence).toBe('COMPLETE');
    expect(fact?.nominalSubtotalCents).toBe(949);
    expect(fact?.discounts.dailySpecialCents).toBe(150);
    expect(fact?.discounts.totalCents).toBe(150);
  });

  it('marks legacy Daily Special gross price incomplete instead of guessing when immutable original-price evidence is missing', async () => {
    const service = legacyService({
      findFirst: jest.fn().mockResolvedValue(
        financialRow({
          subtotalCents: 799,
          subtotalAfterDiscountCents: 799,
          couponDiscountCents: 0,
          loyaltyRedeemCents: 0,
          promotionSnapshot: null,
          items: [
            {
              id: 'line-legacy',
              productStableId: 'item-1',
              displayName: 'Roujiamo',
              nameZh: '肉夹馍',
              nameEn: 'Roujiamo',
              qty: 1,
              unitPriceCents: 799,
              baseUnitPriceCents: 799,
              optionsUnitPriceCents: 0,
              isDailySpecialApplied: true,
              dailySpecialStableId: 'daily-legacy',
            },
          ],
        }),
      ),
    });

    const fact = await service.readFactByOrderStableId('order-stable-1');

    expect(fact?.pricingEvidence).toBe('DAILY_SPECIAL_NOMINAL_UNKNOWN');
    expect(fact?.nominalSubtotalCents).toBeNull();
    expect(fact?.discounts.dailySpecialCents).toBeNull();
    expect(fact?.discounts.totalCents).toBeNull();
  });

  it('keeps unattributed legacy price reductions explicit instead of silently dropping them', async () => {
    const service = legacyService({
      findFirst: jest.fn().mockResolvedValue(
        financialRow({
          subtotalCents: 1000,
          subtotalAfterDiscountCents: 750,
          couponDiscountCents: 100,
          loyaltyRedeemCents: 50,
          promotionSnapshot: null,
          items: [],
        }),
      ),
    });

    const fact = await service.readFactByOrderStableId('order-stable-1');

    expect(fact?.discounts).toEqual({
      dailySpecialCents: 0,
      couponCents: 100,
      automaticPromotionCents: 0,
      posManualCents: 0,
      pointsRedemptionCents: 50,
      unattributedLegacyCents: 100,
      totalCents: 250,
    });
    expect(fact?.nominalSubtotalCents).toBe(1000);
    expect(fact?.subtotalAfterDiscountCents).toBe(750);
  });

  it('combines immutable and legacy replay facts without duplicating Orders that already have a durable sale event', async () => {
    const original = buildOrderFinancialFactV1(
      financialRow() as never,
      'IMMUTABLE_SALE_SNAPSHOT',
    );
    const findMany = jest.fn().mockResolvedValue([
      financialRow({ orderStableId: 'legacy-order' }),
    ]);
    const service = new OrderFinancialFactsReaderService({
      opsEvent: {
        findMany: jest.fn().mockResolvedValue([
          { payload: serializeOrderFinancialFactV1(original) },
        ]),
      },
      order: { findMany },
    } as never);
    const fromInclusive = new Date('2026-09-12T04:00:00.000Z');
    const toExclusive = new Date('2026-09-13T04:00:00.000Z');

    const facts = await service.readFactsForRange({
      fromInclusive,
      toExclusive,
      storeStableId: ' 4750_Yonge_Street ',
    });

    expect(facts.map((fact) => fact.sourceEvidence)).toEqual([
      'IMMUTABLE_SALE_SNAPSHOT',
      'LEGACY_CURRENT_ORDER',
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          paidAt: { gte: fromInclusive, lt: toExclusive },
          status: {
            in: expect.arrayContaining([OrderStatus.refunded]),
          },
          storeId: '4750_Yonge_Street',
          orderStableId: { notIn: ['order-stable-1'] },
        }),
      }),
    );
  });
});
