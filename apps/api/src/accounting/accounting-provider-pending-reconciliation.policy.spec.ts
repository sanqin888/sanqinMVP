import {
  AccountingFinancialProvider,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  projectProviderPendingReconciliation,
  type ProviderPendingReconciliationLineV1,
} from './accounting-provider-pending-reconciliation.policy';

const line = (
  overrides: Partial<ProviderPendingReconciliationLineV1>,
): ProviderPendingReconciliationLineV1 => ({
  provider: AccountingFinancialProvider.UBER_EATS,
  occurredAt: new Date('2026-06-02T12:00:00.000Z'),
  debitCents: 0,
  creditCents: 0,
  source: AccountingJournalSource.ORDER,
  sourceFactType: 'order.financial_sale.v1',
  entryStableId: 'journal_default',
  ...overrides,
});

describe('Provider Pending reconciliation policy', () => {
  it('reconciles production-shaped Uber history without double counting replaced order authority', () => {
    const report = projectProviderPendingReconciliation({
      timezone: 'America/Toronto',
      accountingStartDate: '2026-06-01',
      storeStableId: '4750_Yonge_Street',
      requestedFrom: '2026-06-01',
      requestedTo: '2026-09-23',
      effectiveFrom: '2026-06-01',
      effectiveTo: '2026-09-23',
      fromInclusive: new Date('2026-06-01T04:00:00.000Z'),
      toExclusive: new Date('2026-09-24T04:00:00.000Z'),
      lines: [
        line({
          debitCents: 326_092,
          entryStableId: 'journal_uber_orders',
        }),
        line({
          source: AccountingJournalSource.SYSTEM,
          sourceFactType: 'accounting.uber_pre_cutover_order_reversal.v1',
          creditCents: 326_092,
          entryStableId: 'journal_uber_authority_reversal',
        }),
        line({
          occurredAt: new Date('2026-07-01T03:59:59.999Z'),
          source: AccountingJournalSource.PLATFORM_STATEMENT,
          sourceFactType: 'accounting.provider_financial_document.v1',
          debitCents: 467_662,
          entryStableId: 'journal_uber_statement',
        }),
        line({
          occurredAt: new Date('2026-06-09T04:00:00.000Z'),
          source: AccountingJournalSource.PAYMENT,
          sourceFactType: 'accounting.provider_payout.v1',
          creditCents: 28_448,
          entryStableId: 'journal_uber_payout',
        }),
      ],
      coverage: [
        {
          provider: AccountingFinancialProvider.UBER_EATS,
          financialHistoryRequiredFrom: '2026-06-01',
          financialCompleteThrough: null,
        },
      ],
      provider: AccountingFinancialProvider.UBER_EATS,
    });

    expect(report.providers).toEqual([
      expect.objectContaining({
        provider: AccountingFinancialProvider.UBER_EATS,
        openingBalanceCents: 0,
        canonicalOrderMovementCents: 326_092,
        authorityAdjustmentMovementCents: -326_092,
        providerStatementMovementCents: 467_662,
        payoutReductionCents: 28_448,
        periodNetMovementCents: 439_214,
        closingBalanceCents: 439_214,
        arithmeticDeltaCents: 0,
        entryCounts: {
          canonicalOrder: 1,
          providerStatement: 1,
          authorityAdjustment: 1,
          payout: 1,
          other: 0,
        },
        coverage: {
          status: 'INCOMPLETE',
          financialHistoryRequiredFrom: '2026-06-01',
          financialCompleteThrough: null,
        },
        warnings: [],
      }),
    ]);
  });

  it('carries prior Journal movement into opening balance for a later reconciliation window', () => {
    const report = projectProviderPendingReconciliation({
      timezone: 'America/Toronto',
      accountingStartDate: '2026-06-01',
      storeStableId: '4750_Yonge_Street',
      requestedFrom: '2026-07-01',
      requestedTo: '2026-07-31',
      effectiveFrom: '2026-07-01',
      effectiveTo: '2026-07-31',
      fromInclusive: new Date('2026-07-01T04:00:00.000Z'),
      toExclusive: new Date('2026-08-01T04:00:00.000Z'),
      lines: [
        line({
          provider: AccountingFinancialProvider.CLOVER,
          occurredAt: new Date('2026-06-20T12:00:00.000Z'),
          debitCents: 10_000,
          entryStableId: 'journal_clover_opening',
        }),
        line({
          provider: AccountingFinancialProvider.CLOVER,
          occurredAt: new Date('2026-07-10T12:00:00.000Z'),
          debitCents: 2_500,
          entryStableId: 'journal_clover_period',
        }),
        line({
          provider: AccountingFinancialProvider.CLOVER,
          occurredAt: new Date('2026-07-15T04:00:00.000Z'),
          source: AccountingJournalSource.PAYMENT,
          sourceFactType: 'accounting.provider_payout.v1',
          creditCents: 4_000,
          entryStableId: 'journal_clover_payout',
        }),
      ],
      coverage: [],
      provider: AccountingFinancialProvider.CLOVER,
    });

    expect(report.providers[0]).toMatchObject({
      openingBalanceCents: 10_000,
      canonicalOrderMovementCents: 2_500,
      payoutReductionCents: 4_000,
      periodNetMovementCents: -1_500,
      closingBalanceCents: 8_500,
      arithmeticDeltaCents: 0,
      coverage: { status: 'UNKNOWN' },
    });
  });

  it('surfaces negative Pending and unexpected movement instead of hiding them', () => {
    const report = projectProviderPendingReconciliation({
      timezone: 'America/Toronto',
      accountingStartDate: '2026-06-01',
      storeStableId: '4750_Yonge_Street',
      requestedFrom: '2026-06-01',
      requestedTo: '2026-06-30',
      effectiveFrom: '2026-06-01',
      effectiveTo: '2026-06-30',
      fromInclusive: new Date('2026-06-01T04:00:00.000Z'),
      toExclusive: new Date('2026-07-01T04:00:00.000Z'),
      lines: [
        line({
          provider: AccountingFinancialProvider.FANTUAN,
          source: AccountingJournalSource.MANUAL,
          sourceFactType: 'manual.pending.adjustment',
          debitCents: 100,
          entryStableId: 'journal_other',
        }),
        line({
          provider: AccountingFinancialProvider.FANTUAN,
          source: AccountingJournalSource.PAYMENT,
          sourceFactType: 'accounting.provider_payout.v1',
          creditCents: 200,
          entryStableId: 'journal_payout',
        }),
      ],
      coverage: [],
      provider: AccountingFinancialProvider.FANTUAN,
    });

    expect(report.providers[0]).toMatchObject({
      otherMovementCents: 100,
      payoutReductionCents: 200,
      closingBalanceCents: -100,
      warnings: [
        'NEGATIVE_PENDING_BALANCE',
        'OTHER_LEDGER_MOVEMENT_PRESENT',
      ],
    });
  });
});
