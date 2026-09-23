import type { AccountingBalanceMovementReportV1 } from './accounting-balance-movement.contract';
import {
  renderAccountingBalanceMovementCsv,
  renderAccountingBalanceMovementPdf,
  renderAccountingTrialBalanceCsv,
  renderAccountingTrialBalancePdf,
} from './accounting-statement-export';
import type { AccountingTrialBalanceReportV1 } from './accounting-trial-balance.contract';

const closeStatus = {
  months: [{ periodKey: '2026-07', isClosed: false }],
  years: [{ periodKey: '2026', isClosed: false }],
  allMonthsClosed: false,
};

const trialBalanceReport: AccountingTrialBalanceReportV1 = {
  version: 1,
  scope: 'WHOLE_LEDGER',
  currency: 'CAD',
  timezone: 'America/Toronto',
  accountingStartDate: '2026-06-01',
  requestedFrom: '2026-07-01',
  requestedTo: '2026-07-31',
  effectiveFrom: '2026-07-01',
  effectiveTo: '2026-07-31',
  openingBalanceJournal: {
    entryCount: 0,
    debitCents: 0,
    creditCents: 0,
  },
  totals: {
    openingDebitBalanceCents: 1000,
    openingCreditBalanceCents: 1000,
    periodDebitCents: 500,
    periodCreditCents: 500,
    closingDebitBalanceCents: 1500,
    closingCreditBalanceCents: 1500,
  },
  accounts: [
    {
      accountStableId: 'account_primary_bank',
      accountName: 'Primary Bank',
      accountClass: 'ASSET',
      accountType: 'BANK',
      currency: 'CAD',
      isActive: true,
      normalSide: 'DEBIT',
      openingDebitBalanceCents: 1000,
      openingCreditBalanceCents: 0,
      openingNormalBalanceCents: 1000,
      periodDebitCents: 500,
      periodCreditCents: 0,
      periodNormalMovementCents: 500,
      closingDebitBalanceCents: 1500,
      closingCreditBalanceCents: 0,
      closingNormalBalanceCents: 1500,
    },
    {
      accountStableId: 'account_sales_revenue',
      accountName: 'Sales Revenue',
      accountClass: 'REVENUE',
      accountType: null,
      currency: 'CAD',
      isActive: true,
      normalSide: 'CREDIT',
      openingDebitBalanceCents: 0,
      openingCreditBalanceCents: 1000,
      openingNormalBalanceCents: 1000,
      periodDebitCents: 0,
      periodCreditCents: 500,
      periodNormalMovementCents: 500,
      closingDebitBalanceCents: 0,
      closingCreditBalanceCents: 1500,
      closingNormalBalanceCents: 1500,
    },
  ],
  closeStatus,
};

const balanceMovementReport: AccountingBalanceMovementReportV1 = {
  version: 1,
  statement: 'BALANCE_MOVEMENT',
  scope: 'WHOLE_LEDGER',
  currency: 'CAD',
  timezone: 'America/Toronto',
  accountingStartDate: '2026-06-01',
  requestedFrom: '2026-07-01',
  requestedTo: '2026-07-31',
  effectiveFrom: '2026-07-01',
  effectiveTo: '2026-07-31',
  openingBasis: {
    kind: 'ZERO_MANAGEMENT_OPENING',
    explicitOpeningJournalEntryCount: 0,
    zeroOpeningDisclaimerRequired: true,
    absoluteBalanceClaim: false,
  },
  openingBalanceJournal: {
    entryCount: 0,
    debitCents: 0,
    creditCents: 0,
  },
  assets: {
    openingCumulativeCents: 1000,
    periodMovementCents: 500,
    closingCumulativeCents: 1500,
    accounts: [
      {
        accountStableId: 'account_primary_bank',
        accountName: 'Primary Bank',
        accountType: 'BANK',
        isActive: true,
        openingCumulativeCents: 1000,
        periodMovementCents: 500,
        closingCumulativeCents: 1500,
      },
    ],
  },
  liabilities: {
    openingCumulativeCents: 0,
    periodMovementCents: 0,
    closingCumulativeCents: 0,
    accounts: [],
  },
  directEquity: {
    openingCumulativeCents: 0,
    periodMovementCents: 0,
    closingCumulativeCents: 0,
    accounts: [],
  },
  earningsBridge: {
    revenue: {
      openingCumulativeCents: 1000,
      periodMovementCents: 500,
      closingCumulativeCents: 1500,
    },
    expense: {
      openingCumulativeCents: 0,
      periodMovementCents: 0,
      closingCumulativeCents: 0,
    },
    recordedEarnings: {
      openingCumulativeCents: 1000,
      periodMovementCents: 500,
      closingCumulativeCents: 1500,
    },
  },
  bridge: {
    opening: {
      assetsCents: 1000,
      liabilitiesCents: 0,
      directEquityCents: 0,
      recordedEarningsCents: 1000,
      totalEquityCents: 1000,
      reconciliationCents: 0,
    },
    period: {
      assetsCents: 500,
      liabilitiesCents: 0,
      directEquityCents: 0,
      recordedEarningsCents: 500,
      totalEquityCents: 500,
      reconciliationCents: 0,
    },
    closing: {
      assetsCents: 1500,
      liabilitiesCents: 0,
      directEquityCents: 0,
      recordedEarningsCents: 1500,
      totalEquityCents: 1500,
      reconciliationCents: 0,
    },
  },
  closeStatus,
};

describe('Accounting canonical statement export renderers', () => {
  it('renders Trial Balance CSV from the provided B3 projection without recomputation', () => {
    const csv = renderAccountingTrialBalanceCsv(trialBalanceReport);

    expect(csv).toContain('rowType,accountStableId,accountName');
    expect(csv).toContain(
      'WHOLE_LEDGER,CAD,America/Toronto,2026-06-01,2026-07-01,2026-07-31,2026-07-01,2026-07-31,OPEN',
    );
    expect(csv).toContain('account_primary_bank,Primary Bank');
    expect(csv).toContain(',TOTAL,,TOTAL');
    expect(csv).toContain('15.00');
  });

  it('renders Balance Movement CSV with opening basis and reconciliation rows', () => {
    const csv = renderAccountingBalanceMovementCsv(balanceMovementReport);

    expect(csv).toContain('openingBasis,absoluteBalanceClaim');
    expect(csv).toContain('ZERO_MANAGEMENT_OPENING,false');
    expect(csv).toContain('RECONCILIATION,OPENING');
    expect(csv).toContain('RECONCILIATION,CLOSING');
  });

  it('renders Trial Balance and Balance Movement as complete PDF documents', async () => {
    const [trialPdf, balancePdf] = await Promise.all([
      renderAccountingTrialBalancePdf(trialBalanceReport),
      renderAccountingBalanceMovementPdf(balanceMovementReport),
    ]);

    for (const buffer of [trialPdf, balancePdf]) {
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      expect(buffer.toString('ascii').trimEnd().endsWith('%%EOF')).toBe(true);
      expect(buffer.length).toBeGreaterThan(1_000);
    }
  });
});
