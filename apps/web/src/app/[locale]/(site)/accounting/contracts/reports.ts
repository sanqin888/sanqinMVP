import type { AccountingAccount } from './chart';

export type {
  AccountingCashflowReport,
  AccountingPnlPeriod,
  AccountingPnlReport,
  AccountingPnlSummary,
  AccountingReportGroupBy,
} from '@/lib/contracts/accounting-management';
export type {
  AccountingSalesAnalyticsChannel,
  AccountingSalesAnalyticsPrimaryPaymentMethod,
  AccountingSalesAnalyticsReport,
  AccountingSalesAnalyticsSourceBucket,
  AccountingSalesAttributionQuality,
  AccountingSalesDimensionRow,
  AccountingSalesFinancialProvider,
  AccountingSalesProviderCoverageStatus,
  AccountingSalesSummary,
  AccountingSalesTenderBucket,
} from '@/lib/contracts/accounting-sales';

export type AccountingDashboard = {
  from: string;
  to: string;
  summary: {
    incomeCents: number;
    expenseCents: number;
    adjustmentCents: number;
    netProfitCents: number;
    taxCents: number;
  };
  pending: {
    inboxItems: number;
  };
  topExpenseCategories: Array<{
    categoryStableId: string;
    name: string;
    amountCents: number;
  }>;
  lastClosedMonth: string | null;
};

export type AccountingTrialBalanceNormalSide = 'DEBIT' | 'CREDIT';

export type AccountingTrialBalanceCloseStatus = {
  months: Array<{
    periodKey: string;
    isClosed: boolean;
  }>;
  years: Array<{
    periodKey: string;
    isClosed: boolean;
  }>;
  allMonthsClosed: boolean;
};

export type AccountingTrialBalanceAccountRow = {
  accountStableId: string;
  accountName: string;
  accountClass: AccountingAccount['accountClass'];
  accountType: AccountingAccount['type'] | null;
  currency: string;
  isActive: boolean;
  normalSide: AccountingTrialBalanceNormalSide;
  openingDebitBalanceCents: number;
  openingCreditBalanceCents: number;
  openingNormalBalanceCents: number;
  periodDebitCents: number;
  periodCreditCents: number;
  periodNormalMovementCents: number;
  closingDebitBalanceCents: number;
  closingCreditBalanceCents: number;
  closingNormalBalanceCents: number;
};

export type AccountingTrialBalanceReport = {
  version: 1;
  scope: 'WHOLE_LEDGER';
  currency: string;
  timezone: string;
  accountingStartDate: string;
  requestedFrom: string;
  requestedTo: string;
  effectiveFrom: string;
  effectiveTo: string;
  openingBalanceJournal: {
    entryCount: number;
    debitCents: number;
    creditCents: number;
  };
  totals: {
    openingDebitBalanceCents: number;
    openingCreditBalanceCents: number;
    periodDebitCents: number;
    periodCreditCents: number;
    closingDebitBalanceCents: number;
    closingCreditBalanceCents: number;
  };
  accounts: AccountingTrialBalanceAccountRow[];
  closeStatus: AccountingTrialBalanceCloseStatus;
};

export type AccountingBalanceMovementAmounts = {
  openingCumulativeCents: number;
  periodMovementCents: number;
  closingCumulativeCents: number;
};

export type AccountingBalanceMovementAccountRow =
  AccountingBalanceMovementAmounts & {
    accountStableId: string;
    accountName: string;
    accountType: AccountingAccount['type'] | null;
    isActive: boolean;
  };

export type AccountingBalanceMovementSection =
  AccountingBalanceMovementAmounts & {
    accounts: AccountingBalanceMovementAccountRow[];
  };

export type AccountingStatementDrillThroughPhase =
  | 'OPENING'
  | 'PERIOD'
  | 'CLOSING';

export type AccountingStatementJournalLine = {
  lineNo: number;
  debitCents: number;
  creditCents: number;
  memo: string | null;
  accountStableId: string;
  accountName: string;
  accountClass: AccountingAccount['accountClass'];
  accountType: AccountingAccount['type'] | null;
  categoryStableId: string | null;
  categoryName: string | null;
  categoryType: string | null;
};

export type AccountingStatementJournalEntry = {
  entryStableId: string;
  kind: string;
  source: string;
  sourceFactType: string | null;
  sourceFactStableId: string | null;
  sourceFactVersion: number | null;
  storeStableId: string | null;
  occurredAt: string;
  currency: string;
  memo: string | null;
  accountDebitCents: number;
  accountCreditCents: number;
  accountNormalMovementCents: number;
  entryDebitCents: number;
  entryCreditCents: number;
  highlightedLineNos: number[];
  lines: AccountingStatementJournalLine[];
};

export type AccountingStatementJournalDrillThrough = {
  version: 1;
  scope: 'WHOLE_LEDGER';
  phase: AccountingStatementDrillThroughPhase;
  currency: string;
  timezone: string;
  accountingStartDate: string;
  requestedFrom: string;
  requestedTo: string;
  effectiveFrom: string;
  effectiveTo: string;
  account: {
    accountStableId: string;
    accountName: string;
    accountClass: AccountingAccount['accountClass'];
    accountType: AccountingAccount['type'] | null;
    currency: string;
    isActive: boolean;
    normalSide: AccountingTrialBalanceNormalSide;
  };
  pageSummary: {
    journalEntryCount: number;
    accountDebitCents: number;
    accountCreditCents: number;
    accountNormalMovementCents: number;
  };
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
  entries: AccountingStatementJournalEntry[];
};

export type AccountingBalanceMovementReport = {
  version: 1;
  statement: 'BALANCE_MOVEMENT';
  scope: 'WHOLE_LEDGER';
  currency: string;
  timezone: string;
  accountingStartDate: string;
  requestedFrom: string;
  requestedTo: string;
  effectiveFrom: string;
  effectiveTo: string;
  openingBasis: {
    kind: 'ZERO_MANAGEMENT_OPENING' | 'EXPLICIT_OPENING_JOURNAL';
    explicitOpeningJournalEntryCount: number;
    zeroOpeningDisclaimerRequired: boolean;
    absoluteBalanceClaim: false;
  };
  openingBalanceJournal: {
    entryCount: number;
    debitCents: number;
    creditCents: number;
  };
  assets: AccountingBalanceMovementSection;
  liabilities: AccountingBalanceMovementSection;
  directEquity: AccountingBalanceMovementSection;
  earningsBridge: {
    revenue: AccountingBalanceMovementAmounts;
    expense: AccountingBalanceMovementAmounts;
    recordedEarnings: AccountingBalanceMovementAmounts;
  };
  bridge: {
    opening: {
      assetsCents: number;
      liabilitiesCents: number;
      directEquityCents: number;
      recordedEarningsCents: number;
      totalEquityCents: number;
      reconciliationCents: number;
    };
    period: {
      assetsCents: number;
      liabilitiesCents: number;
      directEquityCents: number;
      recordedEarningsCents: number;
      totalEquityCents: number;
      reconciliationCents: number;
    };
    closing: {
      assetsCents: number;
      liabilitiesCents: number;
      directEquityCents: number;
      recordedEarningsCents: number;
      totalEquityCents: number;
      reconciliationCents: number;
    };
  };
  closeStatus: AccountingTrialBalanceCloseStatus;
};

