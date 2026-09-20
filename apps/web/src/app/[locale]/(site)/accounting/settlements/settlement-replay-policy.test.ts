import type { ProviderSettlementShadowPreview } from '../contracts/settlements';
import { buildProviderSettlementReplayGate } from './settlement-replay-policy';

const DOCUMENT_STABLE_ID = 'acctfindoc_june_2026';

function makePreview(): ProviderSettlementShadowPreview {
  const reversals = Array.from({ length: 83 }, (_, index) => ({
    originalJournalEntryStableId: `journal_sale_${index + 1}`,
    orderStableId: `order_${index + 1}`,
    occurredAt: `2026-06-${String((index % 28) + 1).padStart(2, '0')}T16:00:00.000Z`,
    status: 'READY' as const,
    blockReasons: [],
    coveringDocumentStableIds: [DOCUMENT_STABLE_ID],
    coveredByDocumentStableId: DOCUMENT_STABLE_ID,
    debitCents: index === 82 ? 3538 : 3548,
    creditCents: index === 82 ? 3538 : 3548,
  }));

  return {
    version: 3,
    range: {
      timezone: 'America/Toronto',
      accountingStartDate: '2026-06-01',
      fromDate: '2026-06-01',
      toDateExclusive: '2026-07-01',
      storeStableId: '4750_Yonge_Street',
      provider: 'UBER_EATS',
    },
    coverage: [
      {
        coverageStableId: 'coverage_uber',
        provider: 'UBER_EATS',
        financialHistoryRequiredFrom: '2026-06-01',
        financialCompleteThrough: null,
        liveOrderFactCutoverAt: null,
        orderDetailCoverageFrom: null,
        updatedAt: '2026-09-16T10:24:32.896Z',
      },
    ],
    counts: {
      providerDocuments: 1,
      readyProviderDocuments: 1,
      blockedProviderDocuments: 0,
      preCutoverUberOrderFacts: 83,
      preCutoverUberSaleJournals: 83,
      readyUberOrderReversals: 83,
      blockedUberOrderReversals: 0,
    },
    amounts: {
      readyProviderDebitCents: 294164,
      readyProviderCreditCents: 294164,
      readyUberReversalDebitCents: 294474,
      readyUberReversalCreditCents: 294474,
    },
    providerDocuments: [
      {
        documentStableId: DOCUMENT_STABLE_ID,
        provider: 'UBER_EATS',
        documentType: 'MONTHLY_STATEMENT',
        businessIdentityKey: 'uber:statement:80F13533',
        revision: 1,
        providerDocumentRef: '80F13533',
        periodStart: '2026-06-01',
        periodEnd: '2026-06-30',
        currency: 'CAD',
        salesAuthority: 'STATEMENT_AUTHORITATIVE',
        latestRevisionInRequestedRange: true,
        reviewEvidence: {
          inboxItemStableId: 'inbox_june',
          status: 'CONFIRMED',
          materializedEntityType: 'PROVIDER_FINANCIAL_DOCUMENT',
          materializedEntityStableId: DOCUMENT_STABLE_ID,
          reviewedAt: '2026-09-16T10:24:32.913Z',
          reviewedByUserStableId: 'user_admin',
          version: 4,
        },
        coverageEvidence: {
          coverageStableId: 'coverage_uber',
          financialHistoryRequiredFrom: '2026-06-01',
          financialCompleteThrough: null,
          liveOrderFactCutoverAt: null,
          orderDetailCoverageFrom: null,
          updatedAt: '2026-09-16T10:24:32.896Z',
        },
        status: 'READY',
        blockReasons: [],
        existingJournalEntryStableId: null,
        priorPostedRevision: null,
        decisions: [],
        draftJournal: {
          idempotencyKey: `provider-settlement:${DOCUMENT_STABLE_ID}:r1:v1`,
          kind: 'ADJUSTMENT',
          source: 'PLATFORM_STATEMENT',
          sourceFactType: 'accounting.provider_financial_document.v1',
          sourceFactStableId: DOCUMENT_STABLE_ID,
          sourceFactVersion: 1,
          storeStableId: '4750_Yonge_Street',
          occurredAt: '2026-07-01T03:59:59.999Z',
          currency: 'CAD',
          lines: [
            {
              accountStableId: 'account_uber_pending',
              debitCents: 122285,
              creditCents: 0,
            },
            {
              accountStableId: 'account_platform_commission_expense',
              debitCents: 61912,
              creditCents: 0,
            },
            {
              accountStableId: 'account_platform_promotion_expense',
              debitCents: 58703,
              creditCents: 0,
            },
            {
              accountStableId: 'account_advertising_expense',
              debitCents: 37529,
              creditCents: 0,
            },
            {
              accountStableId: 'account_chargeback_adjustment_expense',
              debitCents: 806,
              creditCents: 0,
            },
            {
              accountStableId: 'account_general_operating_expense',
              debitCents: 2,
              creditCents: 0,
            },
            {
              accountStableId: 'account_hst_recoverable',
              debitCents: 12927,
              creditCents: 0,
            },
            {
              accountStableId: 'account_sales_revenue',
              debitCents: 0,
              creditCents: 267167,
            },
            {
              accountStableId: 'account_hst_payable',
              debitCents: 0,
              creditCents: 26997,
            },
          ],
        },
        debitCents: 294164,
        creditCents: 294164,
      },
    ],
    uberPreCutoverOrderReversals: reversals,
    planHash: 'a'.repeat(64),
  };
}

function addNoopSupportingDocument(
  preview: ProviderSettlementShadowPreview,
): void {
  const supportingId = 'acctfindoc_supporting_detail';
  const source = preview.providerDocuments[0];
  preview.providerDocuments.push({
    ...source,
    documentStableId: supportingId,
    documentType: 'OTHER',
    businessIdentityKey: 'provider:supporting-detail:2026-06',
    providerDocumentRef: 'supporting-detail:2026-06',
    reviewEvidence: source.reviewEvidence
      ? {
          ...source.reviewEvidence,
          materializedEntityStableId: supportingId,
        }
      : null,
    status: 'NOOP',
    blockReasons: [],
    draftJournal: null,
    debitCents: 0,
    creditCents: 0,
  });
  preview.counts.providerDocuments += 1;
}

describe('provider settlement replay UI gate', () => {
  it('opens only for the exact one-document READY June replacement group', () => {
    const gate = buildProviderSettlementReplayGate(
      makePreview(),
      DOCUMENT_STABLE_ID,
    );

    expect(gate.status).toBe('READY');
    expect(gate.blockReasons).toEqual([]);
    expect(gate.confirmationPhrase).toBe('REPLAY JUNE 2026');
    expect(gate.summary).toEqual(
      expect.objectContaining({
        providerDocuments: 1,
        reversalJournals: 83,
        totalJournals: 84,
        providerDebitCents: 294164,
        providerCreditCents: 294164,
        reversalDebitCents: 294474,
        reversalCreditCents: 294474,
        providerPendingNetCents: 122285,
      }),
    );
  });

  it('allows NOOP supporting evidence beside the one READY target document', () => {
    const preview = makePreview();
    addNoopSupportingDocument(preview);

    const gate = buildProviderSettlementReplayGate(
      preview,
      DOCUMENT_STABLE_ID,
    );

    expect(gate.status).toBe('READY');
    expect(gate.blockReasons).toEqual([]);
    expect(gate.summary.providerDocuments).toBe(1);
    expect(gate.summary.totalJournals).toBe(84);
  });

  it('fails closed when any historical reversal is not READY', () => {
    const preview = makePreview();
    preview.uberPreCutoverOrderReversals[0] = {
      ...preview.uberPreCutoverOrderReversals[0],
      status: 'BLOCKED',
      blockReasons: ['NO_READY_AUTHORITATIVE_STATEMENT_COVERAGE'],
      coveredByDocumentStableId: null,
      debitCents: 0,
      creditCents: 0,
    };
    preview.counts.readyUberOrderReversals = 82;
    preview.counts.blockedUberOrderReversals = 1;

    const gate = buildProviderSettlementReplayGate(
      preview,
      DOCUMENT_STABLE_ID,
    );

    expect(gate.status).toBe('BLOCKED');
    expect(gate.blockReasons).toEqual(
      expect.arrayContaining([
        'NOT_ALL_REVERSALS_READY',
        'BLOCKED_REVERSAL_PRESENT',
        'NON_READY_REVERSAL_PRESENT',
        'REVERSAL_COVERAGE_MISMATCH',
      ]),
    );
  });

  it('fails closed when the statement-bounded preview contains another provider document', () => {
    const preview = makePreview();
    preview.providerDocuments.push({
      ...preview.providerDocuments[0],
      documentStableId: 'unexpected_second_document',
      status: 'BLOCKED',
      blockReasons: ['UNEXPECTED_SECOND_DOCUMENT'],
      draftJournal: null,
      debitCents: 0,
      creditCents: 0,
    });
    preview.counts.providerDocuments = 2;
    preview.counts.blockedProviderDocuments = 1;

    const gate = buildProviderSettlementReplayGate(
      preview,
      DOCUMENT_STABLE_ID,
    );

    expect(gate.status).toBe('BLOCKED');
    expect(gate.blockReasons).toEqual(
      expect.arrayContaining([
        'EXPECTED_EXACTLY_ONE_PROVIDER_DOCUMENT',
        'BLOCKED_PROVIDER_DOCUMENT_PRESENT',
      ]),
    );
  });

  it('recognizes the fresh post-write state with NOOP supporting evidence', () => {
    const preview = makePreview();
    addNoopSupportingDocument(preview);
    preview.providerDocuments[0] = {
      ...preview.providerDocuments[0],
      status: 'ALREADY_POSTED',
      existingJournalEntryStableId: 'journal_statement',
      draftJournal: null,
      debitCents: 0,
      creditCents: 0,
    };
    preview.uberPreCutoverOrderReversals =
      preview.uberPreCutoverOrderReversals.map((reversal) => ({
        ...reversal,
        status: 'ALREADY_REVERSED',
        coveredByDocumentStableId: null,
        coveringDocumentStableIds: [],
        debitCents: 0,
        creditCents: 0,
      }));
    preview.counts.readyProviderDocuments = 0;
    preview.counts.readyUberOrderReversals = 0;
    preview.amounts.readyProviderDebitCents = 0;
    preview.amounts.readyProviderCreditCents = 0;
    preview.amounts.readyUberReversalDebitCents = 0;
    preview.amounts.readyUberReversalCreditCents = 0;

    const gate = buildProviderSettlementReplayGate(
      preview,
      DOCUMENT_STABLE_ID,
    );

    expect(gate.status).toBe('COMPLETED');
    expect(gate.summary.totalJournals).toBe(84);
  });
});
