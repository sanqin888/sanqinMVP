import { OrderMarketingUsageFactsReaderService } from './order-marketing-usage-facts-reader.service';

describe('OrderMarketingUsageFactsReaderService', () => {
  it('normalizes snapshot usage and Daily Special legacy fallback without leaking raw snapshots', async () => {
    const financialFacts = {
      readFactsForRange: jest.fn().mockResolvedValue([
        {
          version: 1,
          factStableId: 'order-1',
          orderStableId: 'order-1',
          storeStableId: 'store-1',
          occurredAt: new Date('2026-09-30T16:00:00.000Z'),
          sourceUpdatedAt: new Date('2026-09-30T16:00:01.000Z'),
          sourceEvidence: 'IMMUTABLE_SALE_SNAPSHOT',
          channel: 'web',
          paymentMethod: 'CARD',
          itemQuantity: 3,
          currency: 'CAD',
          pricingEvidence: 'COMPLETE',
          nominalSubtotalCents: 3000,
          effectiveSubtotalCents: 3000,
          discounts: {
            dailySpecialCents: 200,
            couponCents: 300,
            automaticPromotionCents: 500,
            posManualCents: 0,
            pointsRedemptionCents: 0,
            unattributedLegacyCents: 0,
            totalCents: 1000,
          },
          subtotalAfterDiscountCents: 2000,
          taxCents: 260,
          deliveryRevenueCents: 0,
          cardSurchargeCents: 0,
          orderTotalCents: 2260,
          paymentTotalCents: 2260,
        },
        {
          version: 1,
          factStableId: 'order-legacy',
          orderStableId: 'order-legacy',
          storeStableId: 'store-1',
          occurredAt: new Date('2026-08-01T16:00:00.000Z'),
          sourceUpdatedAt: new Date('2026-08-01T16:00:01.000Z'),
          sourceEvidence: 'LEGACY_CURRENT_ORDER',
          channel: 'in_store',
          paymentMethod: 'CASH',
          itemQuantity: 2,
          currency: 'CAD',
          pricingEvidence: 'DAILY_SPECIAL_NOMINAL_UNKNOWN',
          nominalSubtotalCents: null,
          effectiveSubtotalCents: 1500,
          discounts: {
            dailySpecialCents: null,
            couponCents: 0,
            automaticPromotionCents: 0,
            posManualCents: 0,
            pointsRedemptionCents: 0,
            unattributedLegacyCents: 0,
            totalCents: null,
          },
          subtotalAfterDiscountCents: 1500,
          taxCents: 195,
          deliveryRevenueCents: 0,
          cardSurchargeCents: 0,
          orderTotalCents: 1695,
          paymentTotalCents: 1695,
        },
      ]),
    };
    const prisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([
          {
            orderStableId: 'order-1',
            status: 'completed',
            promotionSnapshot: {
              version: 1,
              adjustments: [
                {
                  promotionStableId: 'daily-1',
                  source: 'DAILY_SPECIAL',
                  discountCents: 200,
                  quantity: 2,
                  lineKey: 'line-1',
                  snapshot: { priceApplied: true },
                },
                {
                  promotionStableId: 'daily-not-applied',
                  source: 'DAILY_SPECIAL',
                  discountCents: 0,
                  quantity: 1,
                  lineKey: 'line-2',
                  snapshot: { priceApplied: false },
                },
                {
                  promotionStableId: 'rule-bogo',
                  source: 'AUTOMATIC_PROMOTION',
                  discountCents: 500,
                  targetLineKeys: ['line-1'],
                },
                {
                  promotionStableId: 'coupon-instance-1',
                  source: 'COUPON',
                  discountCents: 300,
                  targetLineKeys: ['line-2'],
                },
                {
                  promotionStableId: 'loyalty-2x',
                  source: 'LOYALTY_PROMOTION',
                  discountCents: 0,
                  loyaltyMultiplier: 2,
                },
              ],
            },
            items: [
              {
                id: 'line-1',
                qty: 2,
                isDailySpecialApplied: true,
                dailySpecialStableId: 'daily-1',
              },
              {
                id: 'line-2',
                qty: 1,
                isDailySpecialApplied: false,
                dailySpecialStableId: null,
              },
            ],
          },
          {
            orderStableId: 'order-legacy',
            status: 'completed',
            promotionSnapshot: null,
            items: [
              {
                id: 'legacy-line',
                qty: 2,
                isDailySpecialApplied: true,
                dailySpecialStableId: 'daily-legacy',
              },
            ],
          },
        ]),
      },
    };

    const service = new OrderMarketingUsageFactsReaderService(
      prisma as never,
      financialFacts as never,
    );
    const facts = await service.readUsageFactsForRange({
      storeStableId: 'store-1',
      fromInclusive: new Date('2026-07-01T00:00:00.000Z'),
      toExclusive: new Date('2026-10-01T00:00:00.000Z'),
    });

    expect(facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          orderStableId: 'order-1',
          activityStableId: 'daily-1',
          source: 'DAILY_SPECIAL',
          affectedItemQuantity: 2,
          affectedItemQuantityEvidence: 'COMPLETE',
          discountCents: 200,
          discountEvidence: 'COMPLETE',
          associatedSalesCents: 2000,
          associatedSalesEvidence: 'IMMUTABLE_SALE_SNAPSHOT',
        }),
        expect.objectContaining({
          activityStableId: 'rule-bogo',
          affectedItemQuantity: 2,
          discountCents: 500,
        }),
        expect.objectContaining({
          activityStableId: 'coupon-instance-1',
          affectedItemQuantity: 1,
          discountCents: 300,
        }),
        expect.objectContaining({
          activityStableId: 'loyalty-2x',
          affectedItemQuantity: null,
          affectedItemQuantityEvidence: 'NOT_APPLICABLE',
          discountCents: 0,
        }),
        expect.objectContaining({
          orderStableId: 'order-legacy',
          activityStableId: 'daily-legacy',
          source: 'DAILY_SPECIAL',
          affectedItemQuantity: 2,
          discountCents: null,
          discountEvidence: 'UNAVAILABLE',
          associatedSalesCents: 1500,
          associatedSalesEvidence: 'LEGACY_CURRENT_ORDER',
        }),
      ]),
    );
    expect(facts).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ activityStableId: 'daily-not-applied' }),
      ]),
    );
    expect(financialFacts.readFactsForRange).toHaveBeenCalledWith({
      storeStableId: 'store-1',
      fromInclusive: new Date('2026-07-01T00:00:00.000Z'),
      toExclusive: new Date('2026-10-01T00:00:00.000Z'),
    });
  });

  it('deduplicates target line keys before summing affected item quantity', async () => {
    const financialFacts = {
      readFactsForRange: jest.fn().mockResolvedValue([
        {
          orderStableId: 'order-1',
          storeStableId: 'store-1',
          occurredAt: new Date('2026-09-30T16:00:00.000Z'),
          sourceEvidence: 'IMMUTABLE_SALE_SNAPSHOT',
          subtotalAfterDiscountCents: 1000,
        },
      ]),
    };
    const prisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([
          {
            orderStableId: 'order-1',
            status: 'completed',
            promotionSnapshot: {
              version: 1,
              adjustments: [
                {
                  promotionStableId: 'rule-1',
                  source: 'AUTOMATIC_PROMOTION',
                  discountCents: 100,
                  targetLineKeys: ['line-1', 'line-1'],
                },
              ],
            },
            items: [
              {
                id: 'line-1',
                qty: 2,
                isDailySpecialApplied: false,
                dailySpecialStableId: null,
              },
            ],
          },
        ]),
      },
    };

    const service = new OrderMarketingUsageFactsReaderService(
      prisma as never,
      financialFacts as never,
    );
    const [fact] = await service.readUsageFactsForRange({
      fromInclusive: new Date('2026-09-01T00:00:00.000Z'),
      toExclusive: new Date('2026-10-01T00:00:00.000Z'),
    });

    expect(fact?.affectedItemQuantity).toBe(2);
  });
});
