import type {
  OrderFinancialChangeFactV1,
  OrderFinancialChangeStateV1,
  OrderFinancialFactV1,
} from '../orders/public-api';
import type {
  PaymentFinancialFactV1,
  PaymentReversalFinancialFactV1,
} from '../payments/public-api';
import { AccountingCanonicalChangePreviewService } from './accounting-canonical-change-preview.service';

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
  paymentMethod: OrderFinancialFactV1['paymentMethod'] = 'CASH',
): OrderFinancialFactV1 => ({
  version: 1,
  factStableId: 'order_stable_1',
  orderStableId: 'order_stable_1',
  storeStableId: '4750_Yonge_Street',
  occurredAt: new Date('2026-09-14T13:00:00.000Z'),
  sourceUpdatedAt: new Date('2026-09-14T13:00:00.000Z'),
  sourceEvidence: 'IMMUTABLE_SALE_SNAPSHOT',
  channel: 'in_store',
  paymentMethod,
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
});

const change = (
  factStableId: string,
  paymentMethod: OrderFinancialChangeStateV1['paymentMethod'] = 'CASH',
): OrderFinancialChangeFactV1 => ({
  version: 1,
  factStableId,
  orderStableId: 'order_stable_1',
  storeStableId: '4750_Yonge_Street',
  occurredAt: new Date('2026-09-14T15:00:00.000Z'),
  kind: 'ADJUSTMENT',
  action: 'VOID_ITEM',
  occurrenceEvidence: 'ORDER_CONFIRMATION',
  channel: 'in_store',
  currency: 'CAD',
  before: state({ paymentMethod }),
  after: state({
    paymentMethod,
    nominalSubtotalCents: 500,
    effectiveSubtotalCents: 500,
    subtotalAfterDiscountCents: 500,
    taxCents: 65,
    orderTotalCents: 565,
    paymentTotalCents: 565,
  }),
  settlement: {
    previousOrderPaymentMethod: paymentMethod,
    resultingOrderPaymentMethod: paymentMethod,
    declaredSettlementPaymentMethod: paymentMethod,
    refundGrossCents: 565,
    redeemReturnCents: 0,
    additionalChargeCents: 0,
  },
});

const cardReversal = (): PaymentReversalFinancialFactV1 => ({
  version: 1,
  factStableId: 'payment-reversal:managed:refund_1:v1',
  originalSaleAttemptId: 'sale_attempt_1',
  reversalAttemptId: 'refund_1',
  providerEventId: null,
  orderStableId: 'order_stable_1',
  storeStableId: '4750_Yonge_Street',
  occurredAt: new Date('2026-09-14T15:00:01.000Z'),
  evidence: 'MANAGED_TRANSACTION',
  provider: 'CLOVER',
  originalPaymentSource: 'POS_TERMINAL',
  paymentMethod: 'CARD',
  kind: 'PARTIAL_REFUND',
  originalSaleBaseAmountCents: 1130,
  originalSaleCustomerTotalCents: 1130,
  baseRefundCents: 565,
  additionalChargeRefundCents: 0,
  customerRefundTotalCents: 565,
  currency: 'CAD',
  externalPaymentId: null,
  providerPaymentId: 'provider_payment_1',
  providerRefundId: 'provider_refund_1',
});

const cardSalePaymentFact = (): PaymentFinancialFactV1 => ({
  version: 1,
  factStableId: 'sale_attempt_1',
  attemptId: 'sale_attempt_1',
  orderStableId: 'order_stable_1',
  storeStableId: '4750_Yonge_Street',
  occurredAt: new Date('2026-09-14T13:00:01.000Z'),
  sourceUpdatedAt: new Date('2026-09-14T13:00:02.000Z'),
  provider: 'CLOVER',
  source: 'POS_TERMINAL',
  paymentMethod: 'CARD',
  operation: 'SALE',
  amountCents: 1130,
  surchargeCents: 0,
  chargedTotalCents: 1130,
  refundedAmountCents: 0,
  currency: 'CAD',
  externalPaymentId: null,
  providerPaymentId: 'provider_payment_1',
  providerRefundId: null,
});

const makeService = (params: {
  changes: OrderFinancialChangeFactV1[];
  originalSale: OrderFinancialFactV1;
  paymentFacts?: PaymentFinancialFactV1[];
  reversals?: PaymentReversalFinancialFactV1[];
  rangeReversals?: PaymentReversalFinancialFactV1[];
  changesByOrder?: Record<string, OrderFinancialChangeFactV1[]>;
}) => {
  const accounting = {
    requireCanonicalFinancialPostingStartAt: jest
      .fn()
      .mockResolvedValue(new Date('2026-06-01T04:00:00.000Z')),
    readCanonicalSaleJournalAnchors: jest.fn().mockResolvedValue([
      {
        entryStableId: 'journal_sale_1',
        sourceFactStableId: params.originalSale.factStableId,
        idempotencyKey: 'canonical-sale:order_stable_1:v1',
      },
    ]),
  };
  const changes = {
    readFactsForRange: jest.fn().mockResolvedValue(params.changes),
    readFactsByOrderStableIds: jest
      .fn()
      .mockImplementation((orderStableIds: string[]) =>
        Promise.resolve(
          orderStableIds.flatMap(
            (orderStableId) => params.changesByOrder?.[orderStableId] ?? [],
          ),
        ),
      ),
  };
  const orders = {
    readFactByOrderStableId: jest.fn().mockResolvedValue(params.originalSale),
  };
  const payments = {
    readFactsByOrderStableIds: jest
      .fn()
      .mockResolvedValue(params.paymentFacts ?? []),
  };
  const paymentReversals = {
    readReversalFactsForRange: jest
      .fn()
      .mockResolvedValue(params.rangeReversals ?? []),
    readReversalFactsByOrderStableIds: jest
      .fn()
      .mockResolvedValue(params.reversals ?? []),
  };
  const loyalty = {
    readFactsByOrderStableIds: jest.fn().mockResolvedValue([]),
  };
  const storeConfig = {
    getConfiguredStoreSnapshot: jest.fn().mockResolvedValue({
      storeStableId: '4750_Yonge_Street',
      timezone: 'America/Toronto',
    }),
  };
  const service = new AccountingCanonicalChangePreviewService(
    accounting as never,
    changes as never,
    orders as never,
    payments as never,
    paymentReversals as never,
    loyalty as never,
    storeConfig as never,
  );
  return { service, accounting, changes, paymentReversals };
};

const input = {
  fromDate: '2026-09-14',
  toDateExclusive: '2026-09-15',
  storeStableId: '4750_Yonge_Street',
};

describe('AccountingCanonicalChangePreviewService', () => {
  it('produces the same plan hash and draft hash from the same canonical facts', async () => {
    const { service } = makeService({
      changes: [change('change_1')],
      originalSale: sale(),
    });

    const first = await service.previewRange(input);
    const second = await service.previewRange(input);

    expect(first.planHash).toMatch(/^[a-f0-9]{64}$/);
    expect(second.planHash).toBe(first.planHash);
    expect(first.counts).toEqual(
      expect.objectContaining({ candidates: 1, ready: 1, blocked: 0 }),
    );
    expect(first.entries[0]).toEqual(
      expect.objectContaining({
        status: 'READY',
        classification: 'READY',
      }),
    );
    expect(first.entries[0]?.draftHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('treats an older in-store CARD SALE with no Payments SALE fact as legacy order-declared settlement', async () => {
    const { service } = makeService({
      changes: [change('change_card_legacy', 'CARD')],
      originalSale: sale('CARD'),
    });

    const report = await service.previewRange(input);

    expect(report.entries[0]).toEqual(
      expect.objectContaining({
        status: 'READY',
        classification: 'READY',
        cardSettlementEvidenceMode: 'LEGACY_ORDER_DECLARED',
        paymentReversalFacts: [],
      }),
    );
    expect(report.entries[0]?.draftHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps explicit legacy CARD execution provenance on order-declared evidence', async () => {
    const { service } = makeService({
      changes: [change('change_card_legacy_explicit', 'CARD')],
      originalSale: {
        ...sale('CARD'),
        posCardExecutionEvidence: 'LEGACY_DIRECT_PAID',
      },
    });

    const report = await service.previewRange(input);

    expect(report.entries[0]).toEqual(
      expect.objectContaining({
        status: 'READY',
        cardSettlementEvidenceMode: 'LEGACY_ORDER_DECLARED',
        originalSale: expect.objectContaining({
          posCardExecutionEvidence: 'LEGACY_DIRECT_PAID',
        }),
      }),
    );
  });

  it('treats a Payments-owned CARD SALE fact as strict route provenance', async () => {
    const { service } = makeService({
      changes: [change('change_card_unified', 'CARD')],
      originalSale: sale('CARD'),
      paymentFacts: [cardSalePaymentFact()],
    });

    const report = await service.previewRange(input);

    expect(report.entries[0]).toEqual(
      expect.objectContaining({
        status: 'BLOCKED',
        classification: 'WAITING_FOR_PAYMENT_EVIDENCE',
        cardSettlementEvidenceMode: 'STRICT_PAYMENT_EVIDENCE',
      }),
    );
    expect(report.entries[0]?.paymentFacts).toEqual([
      expect.objectContaining({
        factStableId: 'sale_attempt_1',
        source: 'POS_TERMINAL',
        paymentMethod: 'CARD',
        operation: 'SALE',
      }),
    ]);
  });

  it('treats explicit Unified execution provenance as strict even if the Payment SALE read is temporarily absent', async () => {
    const { service } = makeService({
      changes: [change('change_card_unified_explicit', 'CARD')],
      originalSale: {
        ...sale('CARD'),
        posCardExecutionEvidence: 'UNIFIED_PAYMENT_CORE',
      },
    });

    const report = await service.previewRange(input);

    expect(report.entries[0]).toEqual(
      expect.objectContaining({
        status: 'BLOCKED',
        classification: 'WAITING_FOR_PAYMENT_EVIDENCE',
        cardSettlementEvidenceMode: 'STRICT_PAYMENT_EVIDENCE',
      }),
    );
  });

  it('looks up the original SALE Journal by owner fact identity rather than Order identity', async () => {
    const originalSale = {
      ...sale(),
      factStableId: 'sale_fact_distinct_from_order',
    };
    const { service, accounting } = makeService({
      changes: [change('change_1')],
      originalSale,
    });

    const report = await service.previewRange(input);

    expect(accounting.readCanonicalSaleJournalAnchors).toHaveBeenCalledWith([
      'sale_fact_distinct_from_order',
    ]);
    expect(report.entries[0]?.originalSale).toEqual(
      expect.objectContaining({
        factStableId: 'sale_fact_distinct_from_order',
        journalEntryStableId: 'journal_sale_1',
      }),
    );
  });

  it('blocks every candidate when one Payments reversal would be reused', async () => {
    const first = change('change_card_1', 'CARD');
    const second = {
      ...change('change_card_2', 'CARD'),
      occurredAt: new Date('2026-09-14T15:05:00.000Z'),
    };
    const { service } = makeService({
      changes: [first, second],
      originalSale: sale('CARD'),
      paymentFacts: [cardSalePaymentFact()],
      reversals: [cardReversal()],
    });

    const report = await service.previewRange(input);

    expect(report.counts.ready).toBe(0);
    expect(report.counts.blocked).toBe(2);
    for (const entry of report.entries) {
      expect(entry.status).toBe('BLOCKED');
      expect(entry.classification).toBe('AMBIGUOUS_PAYMENT_REVERSAL');
      expect(entry.blockReasons.map(({ code }) => code)).toContain(
        'AMBIGUOUS_PAYMENT_REVERSAL',
      );
      expect(entry.draftJournal).toBeNull();
      expect(entry.draftHash).toBeNull();
    }
  });

  it('blocks a range candidate when an out-of-range change can reuse the same Payment reversal', async () => {
    const inRange = change('change_card_in_range', 'CARD');
    const outsideRange = {
      ...change('change_card_outside_range', 'CARD'),
      occurredAt: new Date('2026-09-13T23:00:00.000Z'),
    };
    const providerReversal = cardReversal();
    const { service } = makeService({
      changes: [inRange],
      originalSale: sale('CARD'),
      paymentFacts: [cardSalePaymentFact()],
      reversals: [providerReversal],
      rangeReversals: [providerReversal],
      changesByOrder: { order_stable_1: [inRange, outsideRange] },
    });

    const report = await service.previewRange(input);

    expect(report.entries).toHaveLength(1);
    expect(report.entries[0]?.status).toBe('BLOCKED');
    expect(report.entries[0]?.classification).toBe(
      'AMBIGUOUS_PAYMENT_REVERSAL',
    );
    expect(report.counts.unmatchedPaymentReversals).toBe(0);
  });

  it('surfaces provider money that no canonical Order change consumes as unmatched', async () => {
    const providerReversal = cardReversal();
    const { service } = makeService({
      changes: [change('change_cash_1', 'CASH')],
      originalSale: sale('CASH'),
      reversals: [providerReversal],
      rangeReversals: [providerReversal],
    });

    const report = await service.previewRange(input);

    expect(report.entries[0]?.status).toBe('READY');
    expect(report.counts.unmatchedPaymentReversals).toBe(1);
    expect(report.unmatchedPaymentReversals).toEqual([
      expect.objectContaining({
        factStableId: providerReversal.factStableId,
        classification: 'UNMATCHED_PAYMENT_REVERSAL',
      }),
    ]);
  });

  it('surfaces a range reversal with no canonical Order change as waiting for Order evidence', async () => {
    const unmatched = {
      ...cardReversal(),
      orderStableId: 'order_without_change',
    };
    const { service } = makeService({
      changes: [],
      originalSale: sale('CARD'),
      rangeReversals: [unmatched],
    });

    const report = await service.previewRange(input);

    expect(report.counts.candidates).toBe(0);
    expect(report.counts.unmatchedPaymentReversals).toBe(1);
    expect(report.unmatchedPaymentReversals).toEqual([
      expect.objectContaining({
        factStableId: unmatched.factStableId,
        orderStableId: 'order_without_change',
        classification: 'WAITING_FOR_ORDER_EVIDENCE',
      }),
    ]);
  });

  it('does not call a payment reversal unmatched merely because its Order change is outside the preview range', async () => {
    const outsideRangeChange = {
      ...change('change_outside_range', 'CARD'),
      orderStableId: 'order_outside_range',
      occurredAt: new Date('2026-09-13T23:00:00.000Z'),
    };
    const reversalOutsideRange = {
      ...cardReversal(),
      orderStableId: 'order_outside_range',
    };
    const { service } = makeService({
      changes: [],
      originalSale: {
        ...sale('CARD'),
        factStableId: 'order_outside_range',
        orderStableId: 'order_outside_range',
      },
      reversals: [reversalOutsideRange],
      rangeReversals: [reversalOutsideRange],
      changesByOrder: { order_outside_range: [outsideRangeChange] },
    });

    const report = await service.previewRange(input);

    expect(report.counts.unmatchedPaymentReversals).toBe(0);
    expect(report.unmatchedPaymentReversals).toEqual([]);
  });
});
