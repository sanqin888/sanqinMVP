import { Channel, PaymentMethod } from '@prisma/client';

import {
  appendOrderFinancialSaleFact,
  buildOrderFinancialFactV1,
  ORDER_FINANCIAL_SALE_FACT_EVENT,
  ORDER_FINANCIAL_SALE_FACT_SOURCE,
  parseOrderFinancialFactV1,
  serializeOrderFinancialFactV1,
} from './order-financial-sale-fact';

const snapshot = () => ({
  orderStableId: 'order-stable-1',
  storeId: '4750_Yonge_Street',
  paidAt: new Date('2026-09-12T15:00:00.000Z'),
  updatedAt: new Date('2026-09-12T15:00:00.000Z'),
  channel: Channel.in_store,
  paymentMethod: PaymentMethod.CASH,
  paymentBreakdownJson: null,
  subtotalCents: 799,
  subtotalAfterDiscountCents: 799,
  couponDiscountCents: 0,
  loyaltyRedeemCents: 0,
  taxCents: 104,
  deliveryFeeCents: 0,
  creditCardSurchargeCents: 0,
  totalCents: 903,
  paymentTotalCents: 903,
  couponTitleSnapshot: null,
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
});

describe('Order immutable financial sale fact', () => {
  it('round-trips the V1 fact without losing Daily Special nominal-price evidence', () => {
    const fact = buildOrderFinancialFactV1(
      snapshot(),
      'IMMUTABLE_SALE_SNAPSHOT',
    );

    expect(
      parseOrderFinancialFactV1(serializeOrderFinancialFactV1(fact)),
    ).toEqual(fact);
    expect(fact.nominalSubtotalCents).toBe(949);
    expect(fact.discounts.dailySpecialCents).toBe(150);
  });

  it('freezes explicit POS CARD execution provenance from the existing persisted payment breakdown', () => {
    const legacy = buildOrderFinancialFactV1(
      {
        ...snapshot(),
        paymentMethod: PaymentMethod.CARD,
        paymentBreakdownJson: null,
      },
      'IMMUTABLE_SALE_SNAPSHOT',
    );
    const unified = buildOrderFinancialFactV1(
      {
        ...snapshot(),
        paymentMethod: PaymentMethod.CARD,
        paymentBreakdownJson: {
          cardCents: 903,
          externalChargedCents: 903,
        },
      },
      'IMMUTABLE_SALE_SNAPSHOT',
    );

    expect(legacy.posCardExecutionEvidence).toBe('LEGACY_DIRECT_PAID');
    expect(unified.posCardExecutionEvidence).toBe('UNIFIED_PAYMENT_CORE');
  });

  it('keeps older persisted v1 facts readable when POS CARD execution provenance is absent', () => {
    const fact = buildOrderFinancialFactV1(
      {
        ...snapshot(),
        paymentMethod: PaymentMethod.CARD,
      },
      'IMMUTABLE_SALE_SNAPSHOT',
    );
    const persisted = serializeOrderFinancialFactV1(fact) as Record<
      string,
      unknown
    >;
    delete persisted.posCardExecutionEvidence;

    expect(parseOrderFinancialFactV1(persisted)).toEqual({
      ...fact,
      posCardExecutionEvidence: null,
    });
  });

  it('appends the immutable fact with paidAt occurrence time and stable idempotency in the caller transaction', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const orderSnapshot = snapshot();
    const expectedFact = buildOrderFinancialFactV1(
      orderSnapshot,
      'IMMUTABLE_SALE_SNAPSHOT',
    );
    await appendOrderFinancialSaleFact(
      { opsEvent: { createMany } } as never,
      orderSnapshot,
    );

    expect(createMany).toHaveBeenCalledWith({
      data: {
        idempotencyKey: 'order-financial-sale:order-stable-1:v1',
        eventName: ORDER_FINANCIAL_SALE_FACT_EVENT,
        source: ORDER_FINANCIAL_SALE_FACT_SOURCE,
        occurredAt: new Date('2026-09-12T15:00:00.000Z'),
        payload: serializeOrderFinancialFactV1(expectedFact),
      },
      skipDuplicates: true,
    });
  });
});
