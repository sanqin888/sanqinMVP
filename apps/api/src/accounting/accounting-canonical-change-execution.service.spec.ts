import { ConflictException } from '@nestjs/common';
import {
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from '@prisma/client';

import {
  AccountingCanonicalChangeExecutionService,
  CANONICAL_CHANGE_SYSTEM_ACTOR,
} from './accounting-canonical-change-execution.service';
import type {
  CanonicalChangeShadowEntry,
  CanonicalChangeShadowPreviewReport,
} from './accounting-canonical-change-preview.service';

const PLAN_HASH = 'a'.repeat(64);
const OTHER_PLAN_HASH = 'b'.repeat(64);

const journal = {
  idempotencyKey: 'canonical-reversal:change_card_1:v1',
  kind: AccountingJournalEntryKind.ADJUSTMENT,
  source: AccountingJournalSource.ORDER,
  sourceFactType: 'order.financial_reversal.v1',
  sourceFactStableId: 'change_card_1',
  sourceFactVersion: 1,
  storeStableId: '4750_Yonge_Street',
  occurredAt: '2026-09-14T16:11:21.225Z',
  currency: 'CAD',
  memo: 'Canonical reversal change_card_1',
  lines: [
    {
      accountStableId: 'account_sales_revenue',
      debitCents: 749,
      creditCents: 0,
    },
    {
      accountStableId: 'account_hst_payable',
      debitCents: 97,
      creditCents: 0,
    },
    {
      accountStableId: 'account_clover_pending',
      debitCents: 0,
      creditCents: 846,
    },
  ],
};

const makeEntry = (
  overrides: Partial<CanonicalChangeShadowEntry> = {},
): CanonicalChangeShadowEntry => ({
  changeFactStableId: 'change_card_1',
  orderStableId: 'order_card_1',
  storeStableId: '4750_Yonge_Street',
  kind: 'REVERSAL',
  action: 'FULL_REFUND',
  occurredAt: '2026-09-14T16:11:21.225Z',
  occurrenceEvidence: 'ORDER_CONFIRMATION',
  status: 'READY',
  classification: 'READY',
  cardSettlementEvidenceMode: 'LEGACY_ORDER_DECLARED',
  blockReasons: [],
  ordersFactReference: {
    factType: 'order.financial_reversal.v1',
    factStableId: 'change_card_1',
    version: 1,
  },
  originalSale: {
    factStableId: 'sale_card_1',
    sourceUpdatedAt: '2026-09-14T16:10:31.229Z',
    journalEntryStableId: 'journal_sale_card_1',
    posCardExecutionEvidence: null,
  },
  paymentFacts: [],
  paymentReversalFacts: [],
  loyaltyFacts: [],
  matchedPaymentReversalFactStableIds: [],
  matchedLoyaltyFactStableIds: [],
  draftJournal: journal,
  draftHash: 'c'.repeat(64),
  debitCents: 846,
  creditCents: 846,
  ...overrides,
});

const makeReport = (
  entries: CanonicalChangeShadowEntry[],
  overrides: Partial<CanonicalChangeShadowPreviewReport> = {},
): CanonicalChangeShadowPreviewReport => {
  const ready = entries.filter((entry) => entry.status === 'READY');
  const unmatchedPaymentReversals = overrides.unmatchedPaymentReversals ?? [];
  return {
    version: 1,
    planHash: PLAN_HASH,
    range: {
      timezone: 'America/Toronto',
      accountingStartAt: '2026-09-12T04:00:00.000Z',
      fromDate: '2026-09-14',
      toDateExclusive: '2026-09-15',
      fromInclusive: '2026-09-14T04:00:00.000Z',
      toExclusive: '2026-09-15T04:00:00.000Z',
      storeStableId: '4750_Yonge_Street',
    },
    counts: {
      candidates: entries.length,
      ready: ready.length,
      blocked: entries.length - ready.length,
      unmatchedPaymentReversals: unmatchedPaymentReversals.length,
      byClassification: {},
      byAction: {},
      byPaymentMethod: {},
    },
    amounts: {
      readyDebitCents: ready.reduce(
        (sum, entry) => sum + entry.debitCents,
        0,
      ),
      readyCreditCents: ready.reduce(
        (sum, entry) => sum + entry.creditCents,
        0,
      ),
    },
    entries,
    unmatchedPaymentReversals,
    ...overrides,
  };
};

const makeService = (report: CanonicalChangeShadowPreviewReport) => {
  const preview = {
    previewRange: jest.fn().mockResolvedValue(report),
  };
  const accounting = {
    assertNoLegacyOrderRevenueAccrual: jest.fn().mockResolvedValue(undefined),
    createCanonicalChangeJournalEntry: jest.fn().mockResolvedValue({}),
  };
  return {
    service: new AccountingCanonicalChangeExecutionService(
      preview as never,
      accounting as never,
    ),
    preview,
    accounting,
  };
};

const input = {
  fromDate: '2026-09-14',
  toDateExclusive: '2026-09-15',
  storeStableId: '4750_Yonge_Street',
  expectedPlanHash: PLAN_HASH,
};

describe('AccountingCanonicalChangeExecutionService', () => {
  it('rejects a stale plan hash before any write authority is exercised', async () => {
    const { service, accounting } = makeService(makeReport([makeEntry()]));

    await expect(
      service.executeRange({ ...input, expectedPlanHash: OTHER_PLAN_HASH }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(accounting.assertNoLegacyOrderRevenueAccrual).not.toHaveBeenCalled();
    expect(accounting.createCanonicalChangeJournalEntry).not.toHaveBeenCalled();
  });

  it('writes only READY Journal drafts and carries legacy CARD provenance into deterministic authority', async () => {
    const ready = makeEntry();
    const noop = makeEntry({
      changeFactStableId: 'change_noop_1',
      ordersFactReference: {
        factType: 'order.financial_adjustment.v1',
        factStableId: 'change_noop_1',
        version: 1,
      },
      classification: 'READY_NOOP',
      cardSettlementEvidenceMode: null,
      draftJournal: null,
      draftHash: null,
      debitCents: 0,
      creditCents: 0,
    });
    const blocked = makeEntry({
      changeFactStableId: 'change_blocked_1',
      ordersFactReference: {
        factType: 'order.financial_reversal.v1',
        factStableId: 'change_blocked_1',
        version: 1,
      },
      status: 'BLOCKED',
      classification: 'WAITING_FOR_PAYMENT_EVIDENCE',
      cardSettlementEvidenceMode: 'STRICT_PAYMENT_EVIDENCE',
      blockReasons: [
        {
          code: 'WAITING_FOR_PAYMENT_EVIDENCE',
          message: 'missing exact Payments reversal evidence',
        },
      ],
      draftJournal: null,
      draftHash: null,
      debitCents: 0,
      creditCents: 0,
    });
    const report = makeReport([ready, noop, blocked], {
      unmatchedPaymentReversals: [
        {
          factStableId: 'payment_reversal_unmatched_1',
          orderStableId: 'order_other_1',
          storeStableId: '4750_Yonge_Street',
          occurredAt: '2026-09-14T18:00:00.000Z',
          classification: 'UNMATCHED_PAYMENT_REVERSAL',
          baseRefundCents: 500,
          additionalChargeRefundCents: 0,
          customerRefundTotalCents: 500,
        },
      ],
    });
    const { service, accounting } = makeService(report);

    const result = await service.executeRange(input);

    expect(accounting.assertNoLegacyOrderRevenueAccrual).toHaveBeenCalledTimes(1);
    expect(accounting.createCanonicalChangeJournalEntry).toHaveBeenCalledTimes(1);
    expect(accounting.createCanonicalChangeJournalEntry).toHaveBeenCalledWith(
      journal,
      CANONICAL_CHANGE_SYSTEM_ACTOR,
      {
        version: 1,
        changeFactType: 'order.financial_reversal.v1',
        changeFactStableId: 'change_card_1',
        originalSaleFactStableId: 'sale_card_1',
        originalSaleJournalEntryStableId: 'journal_sale_card_1',
        cardSettlementEvidenceMode: 'LEGACY_ORDER_DECLARED',
        matchedPaymentReversalFactStableIds: [],
        matchedLoyaltyFactStableIds: [],
      },
    );
    expect(result.execution).toEqual({
      postedOrReplayed: 1,
      readyNoopNotWritten: 1,
      blockedNotWritten: 1,
      unmatchedPaymentReversalsNotWritten: 1,
    });
  });

  it('fails closed before writing when READY totals are not balanced', async () => {
    const report = makeReport([makeEntry()], {
      amounts: { readyDebitCents: 846, readyCreditCents: 845 },
    });
    const { service, accounting } = makeService(report);

    await expect(service.executeRange(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(accounting.assertNoLegacyOrderRevenueAccrual).not.toHaveBeenCalled();
    expect(accounting.createCanonicalChangeJournalEntry).not.toHaveBeenCalled();
  });

  it('fails closed when a READY draft loses its original SALE Journal anchor', async () => {
    const report = makeReport([
      makeEntry({
        originalSale: {
          factStableId: 'sale_card_1',
          sourceUpdatedAt: '2026-09-14T16:10:31.229Z',
          journalEntryStableId: null,
          posCardExecutionEvidence: null,
        },
      }),
    ]);
    const { service, accounting } = makeService(report);

    await expect(service.executeRange(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(accounting.assertNoLegacyOrderRevenueAccrual).not.toHaveBeenCalled();
    expect(accounting.createCanonicalChangeJournalEntry).not.toHaveBeenCalled();
  });
});
