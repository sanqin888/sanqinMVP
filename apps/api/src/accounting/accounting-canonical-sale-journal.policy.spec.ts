import type { OrderFinancialFactV1 } from '../orders/public-api';
import { DEFAULT_ACCOUNTING_ACCOUNTS } from './accounting-chart-of-accounts';
import {
  buildCanonicalSaleJournal,
  CANONICAL_SALE_ACCOUNT_IDS,
  CanonicalSaleJournalPolicyError,
} from './accounting-canonical-sale-journal.policy';

function makeFact(
  overrides: Partial<OrderFinancialFactV1> = {},
): OrderFinancialFactV1 {
  return {
    version: 1,
    factStableId: 'order_stable_1',
    orderStableId: 'order_stable_1',
    storeStableId: '4750_Yonge_Street',
    occurredAt: new Date('2026-09-12T16:00:00.000Z'),
    sourceUpdatedAt: new Date('2026-09-12T16:01:00.000Z'),
    sourceEvidence: 'IMMUTABLE_SALE_SNAPSHOT',
    channel: 'in_store',
    paymentMethod: 'CASH',
    itemQuantity: 1,
    currency: 'CAD',
    pricingEvidence: 'COMPLETE',
    nominalSubtotalCents: 1000,
    effectiveSubtotalCents: 1000,
    discounts: {
      dailySpecialCents: 0,
      couponCents: 0,
      automaticPromotionCents: 0,
      posManualCents: 0,
      pointsRedemptionCents: 0,
      unattributedLegacyCents: 0,
      totalCents: 0,
    },
    subtotalAfterDiscountCents: 1000,
    taxCents: 130,
    deliveryRevenueCents: 0,
    cardSurchargeCents: 0,
    orderTotalCents: 1130,
    paymentTotalCents: 1130,
    ...overrides,
  };
}

function lineMap(fact: OrderFinancialFactV1, storeBalanceRedeemedCents = 0) {
  const draft = buildCanonicalSaleJournal({ fact, storeBalanceRedeemedCents });
  return new Map(
    draft.journal.lines.map((line) => [
      line.accountStableId,
      { debitCents: line.debitCents ?? 0, creditCents: line.creditCents ?? 0 },
    ]),
  );
}

describe('Accounting canonical SALE journal policy', () => {
  it('references only stable system accounts present in the default Chart of Accounts', () => {
    const defaultIds = new Set(
      DEFAULT_ACCOUNTING_ACCOUNTS.map(({ accountStableId }) => accountStableId),
    );

    for (const accountStableId of Object.values(CANONICAL_SALE_ACCOUNT_IDS)) {
      expect(defaultIds.has(accountStableId)).toBe(true);
    }
  });

  it('maps CASH to store cash and separates gross revenue from HST', () => {
    const draft = buildCanonicalSaleJournal({
      fact: makeFact(),
      storeBalanceRedeemedCents: 0,
    });
    const lines = lineMap(makeFact());

    expect(draft.journal.idempotencyKey).toBe(
      'canonical-sale:order_stable_1:v1',
    );
    expect(draft.journal.sourceFactType).toBe('order.financial_sale.v1');
    expect(draft.journal.sourceFactStableId).toBe('order_stable_1');
    expect(lines.get('account_store_cash')).toEqual({
      debitCents: 1130,
      creditCents: 0,
    });
    expect(lines.get('account_sales_revenue')).toEqual({
      debitCents: 0,
      creditCents: 1000,
    });
    expect(lines.get('account_hst_payable')).toEqual({
      debitCents: 0,
      creditCents: 130,
    });
  });

  it('maps WECHAT_ALIPAY to store cash', () => {
    const lines = lineMap(makeFact({ paymentMethod: 'WECHAT_ALIPAY' }));

    expect(lines.get('account_store_cash')).toEqual({
      debitCents: 1130,
      creditCents: 0,
    });
  });

  it('maps CARD tender and surcharge to Clover pending plus surcharge revenue', () => {
    const fact = makeFact({
      paymentMethod: 'CARD',
      cardSurchargeCents: 27,
      paymentTotalCents: 1157,
    });
    const lines = lineMap(fact);

    expect(lines.get('account_clover_pending')).toEqual({
      debitCents: 1157,
      creditCents: 0,
    });
    expect(lines.get('account_card_surcharge_revenue')).toEqual({
      debitCents: 0,
      creditCents: 27,
    });
  });

  it('maps Uber tender to the Uber pending receivable', () => {
    const lines = lineMap(
      makeFact({ channel: 'ubereats', paymentMethod: 'UBEREATS' }),
    );

    expect(lines.get('account_uber_pending')).toEqual({
      debitCents: 1130,
      creditCents: 0,
    });
  });

  it('uses Loyalty principal for mixed Store Balance + card tender', () => {
    const fact = makeFact({
      paymentMethod: 'CARD',
      nominalSubtotalCents: 749,
      effectiveSubtotalCents: 749,
      discounts: {
        dailySpecialCents: 0,
        couponCents: 0,
        automaticPromotionCents: 0,
        posManualCents: 0,
        pointsRedemptionCents: 515,
        unattributedLegacyCents: 0,
        totalCents: 515,
      },
      subtotalAfterDiscountCents: 234,
      taxCents: 30,
      orderTotalCents: 264,
      paymentTotalCents: 64,
    });
    const lines = lineMap(fact, 200);

    expect(lines.get('account_clover_pending')).toEqual({
      debitCents: 64,
      creditCents: 0,
    });
    expect(lines.get('account_store_balance_liability')).toEqual({
      debitCents: 200,
      creditCents: 0,
    });
    expect(lines.get('account_sales_discounts')).toEqual({
      debitCents: 515,
      creditCents: 0,
    });
    expect(lines.get('account_sales_revenue')).toEqual({
      debitCents: 0,
      creditCents: 749,
    });
    expect(lines.get('account_hst_payable')).toEqual({
      debitCents: 0,
      creditCents: 30,
    });
  });

  it('supports a pure Store Balance sale without an external tender line', () => {
    const fact = makeFact({
      paymentMethod: 'STORE_BALANCE',
      paymentTotalCents: 0,
    });
    const lines = lineMap(fact, 1130);

    expect(lines.get('account_store_balance_liability')).toEqual({
      debitCents: 1130,
      creditCents: 0,
    });
    expect(lines.has('account_store_cash')).toBe(false);
    expect(lines.has('account_clover_pending')).toBe(false);
  });

  it('supports a points-only zero-customer-tender sale', () => {
    const fact = makeFact({
      paymentMethod: 'CARD',
      discounts: {
        dailySpecialCents: 0,
        couponCents: 0,
        automaticPromotionCents: 0,
        posManualCents: 0,
        pointsRedemptionCents: 1000,
        unattributedLegacyCents: 0,
        totalCents: 1000,
      },
      subtotalAfterDiscountCents: 0,
      taxCents: 0,
      orderTotalCents: 0,
      paymentTotalCents: 0,
    });
    const lines = lineMap(fact);

    expect(lines.size).toBe(2);
    expect(lines.get('account_sales_discounts')).toEqual({
      debitCents: 1000,
      creditCents: 0,
    });
    expect(lines.get('account_sales_revenue')).toEqual({
      debitCents: 0,
      creditCents: 1000,
    });
  });

  it('rejects a zero-item record as non-sale accounting evidence', () => {
    expect(() =>
      buildCanonicalSaleJournal({
        fact: makeFact({ itemQuantity: 0 }),
        storeBalanceRedeemedCents: 0,
      }),
    ).toThrow('requires at least one sold item');
  });

  it('fails closed when pricing evidence is incomplete', () => {
    expect(() =>
      buildCanonicalSaleJournal({
        fact: makeFact({
          pricingEvidence: 'DAILY_SPECIAL_NOMINAL_UNKNOWN',
          nominalSubtotalCents: null,
          discounts: {
            dailySpecialCents: null,
            couponCents: 0,
            automaticPromotionCents: 0,
            posManualCents: 0,
            pointsRedemptionCents: 0,
            unattributedLegacyCents: 0,
            totalCents: null,
          },
        }),
        storeBalanceRedeemedCents: 0,
      }),
    ).toThrow(CanonicalSaleJournalPolicyError);
  });

  it('fails closed when Daily Special attribution does not reconcile nominal to effective subtotal', () => {
    expect(() =>
      buildCanonicalSaleJournal({
        fact: makeFact({
          nominalSubtotalCents: 1200,
          effectiveSubtotalCents: 1000,
          discounts: {
            dailySpecialCents: 100,
            couponCents: 100,
            automaticPromotionCents: 0,
            posManualCents: 0,
            pointsRedemptionCents: 0,
            unattributedLegacyCents: 0,
            totalCents: 200,
          },
        }),
        storeBalanceRedeemedCents: 0,
      }),
    ).toThrow('nominal subtotal minus Daily Special discount');
  });

  it('fails closed when external tender plus Store Balance does not settle the sale', () => {
    expect(() =>
      buildCanonicalSaleJournal({
        fact: makeFact({ paymentMethod: 'CARD', paymentTotalCents: 1000 }),
        storeBalanceRedeemedCents: 0,
      }),
    ).toThrow('external tender + Store Balance redemption');
  });

  it('rejects a card surcharge on a non-card tender', () => {
    expect(() =>
      buildCanonicalSaleJournal({
        fact: makeFact({
          paymentMethod: 'CASH',
          cardSurchargeCents: 27,
          paymentTotalCents: 1157,
        }),
        storeBalanceRedeemedCents: 0,
      }),
    ).toThrow('positive card surcharge requires CARD payment method');
  });
});
