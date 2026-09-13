import { Channel, PaymentMethod } from '@prisma/client';

import {
  appendOrderFinancialChangeFact,
  buildOrderFinancialAdjustmentFact,
  buildOrderFinancialChangeState,
  buildOrderFinancialReversalFact,
  ORDER_FINANCIAL_ADJUSTMENT_FACT_EVENT,
  ORDER_FINANCIAL_CHANGE_FACT_SOURCE,
  ORDER_FINANCIAL_REVERSAL_FACT_EVENT,
  parseOrderFinancialChangeFactV1,
  serializeOrderFinancialChangeFactV1,
  type OrderFinancialChangeSnapshot,
} from './order-financial-change-fact';

const snapshot = (
  overrides: Partial<OrderFinancialChangeSnapshot> = {},
): OrderFinancialChangeSnapshot => ({
  orderStableId: 'order-stable-1',
  storeId: '4750_Yonge_Street',
  channel: Channel.in_store,
  paymentMethod: PaymentMethod.CARD,
  subtotalCents: 1_000,
  subtotalAfterDiscountCents: 900,
  taxCents: 117,
  deliveryFeeCents: 0,
  creditCardSurchargeCents: 0,
  totalCents: 1_017,
  paymentTotalCents: 1_017,
  items: [{ qty: 1, isDailySpecialApplied: false }],
  ...overrides,
});

describe('Order immutable financial change facts', () => {
  it('round-trips an adjustment fact and freezes before/after plus settlement declaration', () => {
    const fact = buildOrderFinancialAdjustmentFact({
      factStableId: 'amendment-stable-1',
      occurredAt: new Date('2026-09-13T20:00:00.000Z'),
      action: 'SWAP_ITEM',
      before: snapshot(),
      after: snapshot({
        subtotalCents: 1_330,
        subtotalAfterDiscountCents: 1_197,
        taxCents: 156,
        totalCents: 1_353,
        paymentTotalCents: 1_353,
      }),
      declaredPaymentMethod: PaymentMethod.CARD,
      refundGrossCents: 0,
      redeemReturnCents: 0,
      additionalChargeCents: 336,
    });

    expect(
      parseOrderFinancialChangeFactV1(
        serializeOrderFinancialChangeFactV1(fact),
      ),
    ).toEqual(fact);
    expect(fact.before.salesDiscountCents).toBe(100);
    expect(fact.after.salesDiscountCents).toBe(133);
    expect(fact.settlement).toEqual({
      previousOrderPaymentMethod: 'CARD',
      resultingOrderPaymentMethod: 'CARD',
      declaredSettlementPaymentMethod: 'CARD',
      refundGrossCents: 0,
      redeemReturnCents: 0,
      additionalChargeCents: 336,
    });
  });

  it('fails closed on Daily-Special nominal/discount presentation without guessing it', () => {
    expect(
      buildOrderFinancialChangeState(
        snapshot({ items: [{ qty: 1, isDailySpecialApplied: true }] }),
      ),
    ).toEqual(
      expect.objectContaining({
        nominalSubtotalCents: null,
        salesDiscountCents: null,
        effectiveSubtotalCents: 1_000,
        subtotalAfterDiscountCents: 900,
      }),
    );
  });

  it('builds a reversal as current financial state to zero while preserving the declared refund method', () => {
    const fact = buildOrderFinancialReversalFact({
      factStableId: 'full_refund_order-stable-1',
      occurredAt: new Date('2026-09-13T20:01:00.000Z'),
      action: 'FULL_REFUND',
      occurrenceEvidence: 'ORDER_CONFIRMATION',
      before: snapshot(),
      declaredPaymentMethod: PaymentMethod.CARD,
      refundGrossCents: 1_017,
    });

    expect(fact.kind).toBe('REVERSAL');
    expect(fact.before.orderTotalCents).toBe(1_017);
    expect(fact.after).toEqual(
      expect.objectContaining({
        paymentMethod: 'CARD',
        orderTotalCents: 0,
        paymentTotalCents: 0,
        nominalSubtotalCents: 0,
        salesDiscountCents: 0,
      }),
    );
  });

  it.each([
    {
      kind: 'adjustment' as const,
      fact: buildOrderFinancialAdjustmentFact({
        factStableId: 'amendment-stable-1',
        occurredAt: new Date('2026-09-13T20:00:00.000Z'),
        action: 'VOID_ITEM',
        before: snapshot(),
        after: snapshot({ totalCents: 900, paymentTotalCents: 900 }),
        declaredPaymentMethod: PaymentMethod.CARD,
        refundGrossCents: 117,
        redeemReturnCents: 0,
        additionalChargeCents: 0,
      }),
      eventName: ORDER_FINANCIAL_ADJUSTMENT_FACT_EVENT,
      idempotencyKey: 'order-financial-adjustment:amendment-stable-1:v1',
    },
    {
      kind: 'reversal' as const,
      fact: buildOrderFinancialReversalFact({
        factStableId: 'full_refund_order-stable-1',
        occurredAt: new Date('2026-09-13T20:01:00.000Z'),
        action: 'FULL_REFUND',
        occurrenceEvidence: 'ORDER_CONFIRMATION',
        before: snapshot(),
        declaredPaymentMethod: PaymentMethod.CARD,
        refundGrossCents: 1_017,
      }),
      eventName: ORDER_FINANCIAL_REVERSAL_FACT_EVENT,
      idempotencyKey: 'order-financial-reversal:full_refund_order-stable-1:v1',
    },
  ])(
    'appends the $kind fact in the caller transaction with stable idempotency',
    async ({ fact, eventName, idempotencyKey }) => {
      const createMany = jest.fn().mockResolvedValue({ count: 1 });

      await appendOrderFinancialChangeFact(
        { opsEvent: { createMany } } as never,
        fact,
      );

      expect(createMany).toHaveBeenCalledWith({
        data: {
          idempotencyKey,
          eventName,
          source: ORDER_FINANCIAL_CHANGE_FACT_SOURCE,
          payload: serializeOrderFinancialChangeFactV1(fact),
          occurredAt: fact.occurredAt,
        },
        skipDuplicates: true,
      });
    },
  );
});
