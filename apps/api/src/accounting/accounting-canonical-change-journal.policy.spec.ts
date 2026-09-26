import type { LoyaltyFinancialFactV1 } from '../loyalty/public-api';
import type {
  OrderFinancialChangeFactV1,
  OrderFinancialChangeStateV1,
  OrderFinancialFactV1,
} from '../orders/public-api';
import type { PaymentReversalFinancialFactV1 } from '../payments/public-api';
import { buildCanonicalChangeJournalPreview } from './accounting-canonical-change-journal.policy';

const state = (
  overrides: Partial<OrderFinancialChangeStateV1> = {},
): OrderFinancialChangeStateV1 => ({
  paymentMethod: 'CASH',
  itemQuantity: 1,
  nominalSubtotalCents: 1000,
  effectiveSubtotalCents: 1000,
  salesDiscountCents: 0,
  subtotalAfterDiscountCents: 1000,
  taxCents: 130,
  deliveryRevenueCents: 0,
  cardSurchargeCents: 0,
  orderTotalCents: 1130,
  paymentTotalCents: 1130,
  ...overrides,
});

const sale = (
  overrides: Partial<OrderFinancialFactV1> = {},
): OrderFinancialFactV1 => ({
  version: 1,
  factStableId: 'order_stable_1',
  orderStableId: 'order_stable_1',
  storeStableId: '4750_Yonge_Street',
  occurredAt: new Date('2026-09-14T14:00:00.000Z'),
  sourceUpdatedAt: new Date('2026-09-14T14:00:00.000Z'),
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
});

const change = (
  overrides: Partial<OrderFinancialChangeFactV1> = {},
): OrderFinancialChangeFactV1 => ({
  version: 1,
  factStableId: 'change_stable_1',
  orderStableId: 'order_stable_1',
  storeStableId: '4750_Yonge_Street',
  occurredAt: new Date('2026-09-14T15:00:00.000Z'),
  kind: 'ADJUSTMENT',
  action: 'VOID_ITEM',
  occurrenceEvidence: 'ORDER_CONFIRMATION',
  channel: 'in_store',
  currency: 'CAD',
  before: state(),
  after: state({
    nominalSubtotalCents: 500,
    effectiveSubtotalCents: 500,
    subtotalAfterDiscountCents: 500,
    taxCents: 65,
    orderTotalCents: 565,
    paymentTotalCents: 565,
  }),
  settlement: {
    previousOrderPaymentMethod: 'CASH',
    resultingOrderPaymentMethod: 'CASH',
    declaredSettlementPaymentMethod: 'CASH',
    refundGrossCents: 565,
    redeemReturnCents: 0,
    additionalChargeCents: 0,
  },
  ...overrides,
});

const reversal = (
  overrides: Partial<PaymentReversalFinancialFactV1> = {},
): PaymentReversalFinancialFactV1 => ({
  version: 1,
  factStableId: 'payment-reversal:managed:refund_1:v1',
  originalSaleAttemptId: 'sale_attempt_1',
  reversalAttemptId: 'refund_1',
  providerEventId: null,
  orderStableId: 'order_stable_1',
  storeStableId: '4750_Yonge_Street',
  occurredAt: new Date('2026-09-14T15:00:00.000Z'),
  evidence: 'MANAGED_TRANSACTION',
  provider: 'CLOVER',
  originalPaymentSource: 'POS_TERMINAL',
  paymentMethod: 'CARD',
  kind: 'FULL_REFUND',
  originalSaleBaseAmountCents: 1130,
  originalSaleCustomerTotalCents: 1157,
  baseRefundCents: 1130,
  tipRefundCents: 0,
  additionalChargeRefundCents: 27,
  customerRefundTotalCents: 1157,
  currency: 'CAD',
  externalPaymentId: null,
  providerPaymentId: 'provider_payment_1',
  providerRefundId: 'provider_refund_1',
  ...overrides,
});

const loyalty = (
  kind: LoyaltyFinancialFactV1['kind'],
  amountCents: number,
  factStableId: string,
): LoyaltyFinancialFactV1 => ({
  version: 1,
  factStableId,
  kind,
  occurredAt: new Date('2026-09-14T15:00:00.000Z'),
  orderStableId: 'order_stable_1',
  sourceKey:
    kind === 'STORE_BALANCE_RETURNED'
      ? 'FULL_REFUND_BALANCE'
      : 'PAYMENT_BALANCE',
  currency: 'CAD',
  amountCents,
});

const preview = (params: {
  change?: OrderFinancialChangeFactV1;
  originalSale?: OrderFinancialFactV1;
  reversals?: PaymentReversalFinancialFactV1[];
  loyalty?: LoyaltyFinancialFactV1[];
  cardSettlementEvidenceMode?:
    | 'LEGACY_ORDER_DECLARED'
    | 'STRICT_PAYMENT_EVIDENCE'
    | 'UNRESOLVED';
}) => {
  const targetChange = params.change ?? change();
  const usesCard =
    targetChange.settlement.previousOrderPaymentMethod === 'CARD' ||
    targetChange.settlement.resultingOrderPaymentMethod === 'CARD' ||
    targetChange.settlement.declaredSettlementPaymentMethod === 'CARD';
  return buildCanonicalChangeJournalPreview({
    change: targetChange,
    originalSale: params.originalSale ?? sale(),
    originalSaleJournalEntryStableId: 'journal_sale_1',
    paymentFacts: [],
    paymentReversalFacts: params.reversals ?? [],
    loyaltyFacts: params.loyalty ?? [],
    cardSettlementEvidenceMode: usesCard
      ? (params.cardSettlementEvidenceMode ?? 'STRICT_PAYMENT_EVIDENCE')
      : null,
  });
};

describe('canonical adjustment/reversal Journal shadow policy', () => {
  it('builds a balanced delta-only CASH void draft', () => {
    const result = preview({});
    expect(result.status).toBe('READY');
    expect(result.classification).toBe('READY');
    expect(result.journal).toEqual(
      expect.objectContaining({
        idempotencyKey: 'canonical-adjustment:change_stable_1:v1',
        sourceFactStableId: 'change_stable_1',
      }),
    );
    const debit = result.journal!.lines.reduce(
      (sum, line) => sum + (line.debitCents ?? 0),
      0,
    );
    const credit = result.journal!.lines.reduce(
      (sum, line) => sum + (line.creditCents ?? 0),
      0,
    );
    expect(debit).toBe(565);
    expect(credit).toBe(565);
  });

  it('fails closed when a CARD refund lacks Payments owner evidence', () => {
    const result = preview({
      change: change({
        before: state({ paymentMethod: 'CARD' }),
        after: state({
          paymentMethod: 'CARD',
          nominalSubtotalCents: 500,
          effectiveSubtotalCents: 500,
          subtotalAfterDiscountCents: 500,
          taxCents: 65,
          orderTotalCents: 565,
          paymentTotalCents: 565,
        }),
        settlement: {
          previousOrderPaymentMethod: 'CARD',
          resultingOrderPaymentMethod: 'CARD',
          declaredSettlementPaymentMethod: 'CARD',
          refundGrossCents: 565,
          redeemReturnCents: 0,
          additionalChargeCents: 0,
        },
      }),
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.blockReasons.map(({ code }) => code)).toContain(
      'WAITING_FOR_PAYMENT_EVIDENCE',
    );
    expect(result.journal).toBeNull();
  });

  it('allows a legacy in-store CARD refund to use explicitly declared Order settlement', () => {
    const result = preview({
      cardSettlementEvidenceMode: 'LEGACY_ORDER_DECLARED',
      originalSale: sale({ paymentMethod: 'CARD' }),
      change: change({
        before: state({ paymentMethod: 'CARD' }),
        after: state({
          paymentMethod: 'CARD',
          nominalSubtotalCents: 500,
          effectiveSubtotalCents: 500,
          subtotalAfterDiscountCents: 500,
          taxCents: 65,
          orderTotalCents: 565,
          paymentTotalCents: 565,
        }),
        settlement: {
          previousOrderPaymentMethod: 'CARD',
          resultingOrderPaymentMethod: 'CARD',
          declaredSettlementPaymentMethod: 'CARD',
          refundGrossCents: 565,
          redeemReturnCents: 0,
          additionalChargeCents: 0,
        },
      }),
    });

    expect(result.status).toBe('READY');
    expect(result.classification).toBe('READY');
    expect(result.cardSettlementEvidenceMode).toBe('LEGACY_ORDER_DECLARED');
    expect(result.matchedPaymentReversalFactStableIds).toEqual([]);
    expect(result.journal?.idempotencyKey).toBe(
      'canonical-adjustment:change_stable_1:v1',
    );
  });

  it('allows a legacy in-store CARD full refund to reverse from Orders-declared settlement', () => {
    const result = preview({
      cardSettlementEvidenceMode: 'LEGACY_ORDER_DECLARED',
      originalSale: sale({ paymentMethod: 'CARD' }),
      change: change({
        kind: 'REVERSAL',
        action: 'FULL_REFUND',
        before: state({ paymentMethod: 'CARD' }),
        after: state({
          paymentMethod: 'CARD',
          itemQuantity: 0,
          nominalSubtotalCents: 0,
          effectiveSubtotalCents: 0,
          salesDiscountCents: 0,
          subtotalAfterDiscountCents: 0,
          taxCents: 0,
          orderTotalCents: 0,
          paymentTotalCents: 0,
        }),
        settlement: {
          previousOrderPaymentMethod: 'CARD',
          resultingOrderPaymentMethod: 'CARD',
          declaredSettlementPaymentMethod: 'CARD',
          refundGrossCents: 1130,
          redeemReturnCents: 0,
          additionalChargeCents: 0,
        },
      }),
    });

    expect(result.status).toBe('READY');
    expect(result.classification).toBe('READY');
    expect(result.cardSettlementEvidenceMode).toBe('LEGACY_ORDER_DECLARED');
    expect(result.matchedPaymentReversalFactStableIds).toEqual([]);
    expect(result.journal?.idempotencyKey).toBe(
      'canonical-reversal:change_stable_1:v1',
    );
  });

  it('treats webhook null surcharge semantics as unknown, not zero', () => {
    const cardSale = sale({
      paymentMethod: 'CARD',
      cardSurchargeCents: 27,
      paymentTotalCents: 1157,
    });
    const result = preview({
      originalSale: cardSale,
      change: change({
        kind: 'REVERSAL',
        action: 'FULL_REFUND',
        before: state({
          paymentMethod: 'CARD',
          cardSurchargeCents: 27,
          paymentTotalCents: 1157,
        }),
        after: state({
          paymentMethod: 'CARD',
          itemQuantity: 0,
          nominalSubtotalCents: 0,
          effectiveSubtotalCents: 0,
          salesDiscountCents: 0,
          subtotalAfterDiscountCents: 0,
          taxCents: 0,
          cardSurchargeCents: 0,
          orderTotalCents: 0,
          paymentTotalCents: 0,
        }),
        settlement: {
          previousOrderPaymentMethod: 'CARD',
          resultingOrderPaymentMethod: 'CARD',
          declaredSettlementPaymentMethod: 'CARD',
          refundGrossCents: 1130,
          redeemReturnCents: 0,
          additionalChargeCents: 0,
        },
      }),
      reversals: [
        reversal({
          evidence: 'PROVIDER_WEBHOOK',
          reversalAttemptId: null,
          providerEventId: 'provider_event_1',
          additionalChargeRefundCents: null,
          customerRefundTotalCents: null,
        }),
      ],
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.blockReasons.map(({ code }) => code)).toContain(
      'WAITING_FOR_PAYMENT_EVIDENCE',
    );
  });

  it('allows webhook null additional-charge fields only when Payments proves the original sale had none', () => {
    const result = preview({
      originalSale: sale({ paymentMethod: 'CARD' }),
      change: change({
        kind: 'REVERSAL',
        action: 'FULL_REFUND',
        before: state({ paymentMethod: 'CARD' }),
        after: state({
          paymentMethod: 'CARD',
          itemQuantity: 0,
          nominalSubtotalCents: 0,
          effectiveSubtotalCents: 0,
          salesDiscountCents: 0,
          subtotalAfterDiscountCents: 0,
          taxCents: 0,
          orderTotalCents: 0,
          paymentTotalCents: 0,
        }),
        settlement: {
          previousOrderPaymentMethod: 'CARD',
          resultingOrderPaymentMethod: 'CARD',
          declaredSettlementPaymentMethod: 'CARD',
          refundGrossCents: 1130,
          redeemReturnCents: 0,
          additionalChargeCents: 0,
        },
      }),
      reversals: [
        reversal({
          evidence: 'PROVIDER_WEBHOOK',
          reversalAttemptId: null,
          providerEventId: 'provider_event_no_surcharge',
          originalSaleCustomerTotalCents: 1130,
          additionalChargeRefundCents: null,
          customerRefundTotalCents: null,
        }),
      ],
    });

    expect(result.status).toBe('READY');
    expect(result.classification).toBe('READY');
    expect(result.journal?.idempotencyKey).toBe(
      'canonical-reversal:change_stable_1:v1',
    );
  });

  it('uses Loyalty principal truth for a pure Store Balance full reversal', () => {
    const balanceSale = sale({
      paymentMethod: 'STORE_BALANCE',
      paymentTotalCents: 1130,
    });
    const result = preview({
      originalSale: balanceSale,
      change: change({
        kind: 'REVERSAL',
        action: 'FULL_REFUND',
        before: state({
          paymentMethod: 'STORE_BALANCE',
          paymentTotalCents: 1130,
        }),
        after: state({
          paymentMethod: 'STORE_BALANCE',
          itemQuantity: 0,
          nominalSubtotalCents: 0,
          effectiveSubtotalCents: 0,
          salesDiscountCents: 0,
          subtotalAfterDiscountCents: 0,
          taxCents: 0,
          orderTotalCents: 0,
          paymentTotalCents: 0,
        }),
        settlement: {
          previousOrderPaymentMethod: 'STORE_BALANCE',
          resultingOrderPaymentMethod: 'STORE_BALANCE',
          declaredSettlementPaymentMethod: 'STORE_BALANCE',
          refundGrossCents: 1130,
          redeemReturnCents: 0,
          additionalChargeCents: 0,
        },
      }),
      loyalty: [
        loyalty('STORE_BALANCE_REDEEMED', 1130, 'ledger_redeemed_1'),
        loyalty('STORE_BALANCE_RETURNED', 1130, 'ledger_returned_1'),
      ],
    });
    expect(result.status).toBe('READY');
    expect(result.matchedLoyaltyFactStableIds).toContain('ledger_returned_1');
    expect(result.journal?.idempotencyKey).toBe(
      'canonical-reversal:change_stable_1:v1',
    );
  });

  it('returns READY_NOOP for a CASH to WECHAT_ALIPAY retender on the same ledger account', () => {
    const result = preview({
      change: change({
        action: 'RETENDER',
        before: state({ paymentMethod: 'CASH' }),
        after: state({ paymentMethod: 'WECHAT_ALIPAY' }),
        settlement: {
          previousOrderPaymentMethod: 'CASH',
          resultingOrderPaymentMethod: 'WECHAT_ALIPAY',
          declaredSettlementPaymentMethod: 'WECHAT_ALIPAY',
          refundGrossCents: 1130,
          redeemReturnCents: 0,
          additionalChargeCents: 1130,
        },
      }),
    });
    expect(result.status).toBe('READY');
    expect(result.classification).toBe('READY_NOOP');
    expect(result.journal).toBeNull();
  });

  it('blocks CARD retender with surcharge until surcharge settlement is explicit', () => {
    const result = preview({
      originalSale: sale({
        paymentMethod: 'CARD',
        cardSurchargeCents: 27,
        paymentTotalCents: 1157,
      }),
      change: change({
        action: 'RETENDER',
        before: state({
          paymentMethod: 'CARD',
          cardSurchargeCents: 27,
          paymentTotalCents: 1157,
        }),
        after: state({
          paymentMethod: 'CASH',
          cardSurchargeCents: 27,
          paymentTotalCents: 1157,
        }),
        settlement: {
          previousOrderPaymentMethod: 'CARD',
          resultingOrderPaymentMethod: 'CASH',
          declaredSettlementPaymentMethod: 'CASH',
          refundGrossCents: 1130,
          redeemReturnCents: 0,
          additionalChargeCents: 1130,
        },
      }),
      reversals: [
        reversal({
          kind: 'PARTIAL_REFUND',
          baseRefundCents: 1130,
          additionalChargeRefundCents: 0,
          customerRefundTotalCents: 1130,
        }),
      ],
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.blockReasons.map(({ code }) => code)).toContain(
      'WAITING_FOR_PAYMENT_EVIDENCE',
    );
  });

  it('blocks CARD additional charge until Payments exposes change-scoped collection truth', () => {
    const result = preview({
      cardSettlementEvidenceMode: 'LEGACY_ORDER_DECLARED',
      change: change({
        before: state({ paymentMethod: 'CARD' }),
        after: state({
          paymentMethod: 'CARD',
          nominalSubtotalCents: 1100,
          effectiveSubtotalCents: 1100,
          subtotalAfterDiscountCents: 1100,
          taxCents: 143,
          orderTotalCents: 1243,
          paymentTotalCents: 1243,
        }),
        settlement: {
          previousOrderPaymentMethod: 'CARD',
          resultingOrderPaymentMethod: 'CARD',
          declaredSettlementPaymentMethod: 'CARD',
          refundGrossCents: 0,
          redeemReturnCents: 0,
          additionalChargeCents: 113,
        },
      }),
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.blockReasons.map(({ code }) => code)).toContain(
      'WAITING_FOR_PAYMENT_EVIDENCE',
    );
  });
});
