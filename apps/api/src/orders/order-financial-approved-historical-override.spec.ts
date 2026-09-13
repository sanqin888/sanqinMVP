import {
  APPROVED_HISTORICAL_DAILY_SPECIAL_OVERRIDE_ORDER_STABLE_IDS,
  isApprovedHistoricalDailySpecialOverrideOrder,
} from './approved-historical-daily-special-overrides';
import { resolveApprovedHistoricalDailySpecialPricing } from './order-financial-replay';
import type { OrderFinancialFactV1 } from './order-financial-facts-reader.contract';

const sourceFact = (effectiveSubtotalCents: number): OrderFinancialFactV1 => ({
  version: 1,
  factStableId: 'approved-order',
  orderStableId: 'approved-order',
  storeStableId: '4750_Yonge_Street',
  occurredAt: new Date('2026-07-01T16:00:00.000Z'),
  sourceUpdatedAt: new Date('2026-07-01T16:00:00.000Z'),
  sourceEvidence: 'LEGACY_CURRENT_ORDER',
  channel: 'in_store',
  paymentMethod: 'CARD',
  itemQuantity: 1,
  currency: 'CAD',
  pricingEvidence: 'DAILY_SPECIAL_NOMINAL_UNKNOWN',
  nominalSubtotalCents: null,
  effectiveSubtotalCents,
  discounts: {
    dailySpecialCents: null,
    couponCents: 0,
    automaticPromotionCents: 0,
    posManualCents: 0,
    pointsRedemptionCents: 0,
    unattributedLegacyCents: 0,
    totalCents: null,
  },
  subtotalAfterDiscountCents: effectiveSubtotalCents,
  taxCents: 0,
  deliveryRevenueCents: 0,
  cardSurchargeCents: 0,
  orderTotalCents: effectiveSubtotalCents,
  paymentTotalCents: effectiveSubtotalCents,
});

describe('approved historical Daily Special accounting override', () => {
  it('is locked to the explicitly reviewed 105 Order stable IDs', () => {
    expect(
      APPROVED_HISTORICAL_DAILY_SPECIAL_OVERRIDE_ORDER_STABLE_IDS.size,
    ).toBe(105);
    expect(
      isApprovedHistoricalDailySpecialOverrideOrder(
        'cmq122g5t00cjo301r03lx5xf',
      ),
    ).toBe(true);
    expect(
      isApprovedHistoricalDailySpecialOverrideOrder('future-order-stable-id'),
    ).toBe(false);
  });

  it('uses current Catalog base when it is higher while preserving historical option value', () => {
    const result = resolveApprovedHistoricalDailySpecialPricing({
      sourceFact: sourceFact(699),
      row: {
        items: [
          {
            productStableId: 'item-1',
            qty: 1,
            unitPriceCents: 699,
            baseUnitPriceCents: 599,
            optionsUnitPriceCents: 100,
            isDailySpecialApplied: true,
            dailySpecialStableId: 'daily-1',
          },
        ],
      } as never,
      catalogFacts: [
        {
          stableId: 'item-1',
          nameEn: 'Item',
          nameZh: '菜品',
          basePriceCents: 749,
        } as never,
      ],
    });

    expect(result.pricingResolution).toBe('APPROVED_HISTORICAL_OVERRIDE');
    expect(result.resolvedFact?.nominalSubtotalCents).toBe(849);
    expect(result.resolvedFact?.discounts.dailySpecialCents).toBe(150);
    expect(result.resolvedFact?.discounts.totalCents).toBe(150);
  });

  it('uses historical effective base when it is higher so the override never creates a negative discount', () => {
    const result = resolveApprovedHistoricalDailySpecialPricing({
      sourceFact: sourceFact(999),
      row: {
        items: [
          {
            productStableId: 'item-1',
            qty: 1,
            unitPriceCents: 999,
            baseUnitPriceCents: 899,
            optionsUnitPriceCents: 100,
            isDailySpecialApplied: true,
            dailySpecialStableId: 'daily-1',
          },
        ],
      } as never,
      catalogFacts: [
        {
          stableId: 'item-1',
          nameEn: 'Item',
          nameZh: '菜品',
          basePriceCents: 749,
        } as never,
      ],
    });

    expect(result.pricingResolution).toBe('APPROVED_HISTORICAL_OVERRIDE');
    expect(result.resolvedFact?.nominalSubtotalCents).toBe(999);
    expect(result.resolvedFact?.discounts.dailySpecialCents).toBe(0);
    expect(result.resolvedFact?.discounts.totalCents).toBe(0);
  });
});
