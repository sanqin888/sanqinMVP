import type { AccountingAccount, AccountingCategory } from './chart';
import type { AccountingFinancialProvider } from './core';

export type AccountingReportGroupBy = 'month' | 'quarter' | 'year';

export type AccountingPnlSummary = {
  incomeCents: number;
  expenseCents: number;
  adjustmentCents: number;
  transferCents: number;
  netProfitCents: number;
};

export type AccountingPnlPeriod = {
  period: string;
  incomeCents: number;
  expenseCents: number;
  adjustmentCents: number;
  transferCents: number;
  netProfitCents: number;
  isClosed: boolean;
};

export type AccountingPnlReport = {
  groupBy: AccountingReportGroupBy;
  from: string | null;
  to: string | null;
  summary: AccountingPnlSummary;
  periods: AccountingPnlPeriod[];
  byCategory: Array<{
    categoryStableId: string;
    categoryName: string;
    type: AccountingCategory['type'];
    amountCents: number;
  }>;
  byCategoryTree: Array<{
    categoryStableId: string;
    categoryName: string;
    type: AccountingCategory['type'];
    parentStableId: string | null;
    amountCents: number;
  }>;
  bySource: Array<{
    source: string;
    amountCents: number;
  }>;
  adjustmentBreakdown: Array<{
    source: string;
    sourceFactType: string | null;
    journalCount: number;
    revenueNetCents: number;
    expenseNetCents: number;
    netProfitEffectCents: number;
  }>;
  trends: {
    currentMonthNetCents: number;
    lastMonthNetCents: number;
    quarterToDateNetCents: number;
  };
  closeStatus: {
    currentMonth: boolean;
    lastMonth: boolean;
  };
};

export type AccountingCashflowReport = {
  from: string | null;
  to: string | null;
  operatingCents: number;
  investingCents: number;
  financingCents: number;
  netCashflowCents: number;
};

export type AccountingAccountBalanceReport = Array<{
  accountStableId: string;
  accountName: string;
  inflowCents: number;
  outflowCents: number;
  balanceChangeCents: number;
}>;

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

export type AccountingSalesSummary = {
  grossSalesCents: number;
  discountsCents: number;
  netFoodSalesCents: number;
  deliveryRevenueCents: number;
  cardSurchargeRevenueCents: number;
  netSalesRevenueCents: number;
  outputTaxCents: number;
  tipsCents: number;
  otherOperatingRevenueCents: number;
  platformCommissionCents: number;
  paymentProcessingFeeCents: number;
  platformPromotionCents: number;
  advertisingCents: number;
  chargebackCents: number;
  providerOtherFeeCents: number;
  contributionCents: number;
};

export type AccountingSalesAnalyticsChannel =
  | 'web'
  | 'in_store'
  | 'ubereats'
  | 'fantuan'
  | 'UNATTRIBUTED_PROVIDER'
  | 'UNATTRIBUTED';

export type AccountingSalesAnalyticsPrimaryPaymentMethod =
  | 'CASH'
  | 'CARD'
  | 'WECHAT_ALIPAY'
  | 'STORE_BALANCE'
  | 'UBEREATS'
  | 'FANTUAN'
  | 'UNATTRIBUTED';

export type AccountingSalesTenderBucket =
  | 'STORE_CASH_EQUIVALENT'
  | 'CLOVER_CARD'
  | 'UBER_EATS'
  | 'FANTUAN'
  | 'STORE_BALANCE';

export type AccountingSalesAnalyticsSourceBucket =
  | 'ORDER_SALE'
  | 'ORDER_CHANGE'
  | 'PROVIDER_STATEMENT'
  | 'HISTORICAL_REPLACEMENT_REVERSAL';

export type AccountingSalesAttributionQuality =
  | 'IMMUTABLE'
  | 'LEGACY_CURRENT_ORDER'
  | 'MISSING';

export type AccountingSalesProviderCoverageStatus =
  | 'COMPLETE'
  | 'INCOMPLETE'
  | 'UNKNOWN'
  | 'NOT_APPLICABLE';

export type AccountingSalesDimensionRow<T extends string> = {
  key: T;
  journalEntryCount: number;
  summary: AccountingSalesSummary;
};

export type AccountingSalesAnalyticsReport = {
  version: 1;
  storeStableId: string;
  timezone: string;
  accountingStartDate: string;
  from: string;
  to: string;
  summary: AccountingSalesSummary;
  daily: Array<{
    date: string;
    journalEntryCount: number;
    summary: AccountingSalesSummary;
  }>;
  byChannel: Array<
    AccountingSalesDimensionRow<AccountingSalesAnalyticsChannel>
  >;
  byPrimaryPaymentMethod: Array<
    AccountingSalesDimensionRow<AccountingSalesAnalyticsPrimaryPaymentMethod>
  >;
  tenderMix: Array<{
    tender: AccountingSalesTenderBucket;
    amountCents: number;
  }>;
  bySource: Array<
    AccountingSalesDimensionRow<AccountingSalesAnalyticsSourceBucket>
  >;
  attribution: {
    immutableOrderAttributedJournalEntries: number;
    legacyOrderAttributedJournalEntries: number;
    missingOrderAttributedJournalEntries: number;
    worstQuality: AccountingSalesAttributionQuality | null;
  };
  providerCoverage: {
    overall: AccountingSalesProviderCoverageStatus;
    providers: Array<{
      provider: AccountingFinancialProvider;
      status: AccountingSalesProviderCoverageStatus;
      financialHistoryRequiredFrom: string | null;
      financialCompleteThrough: string | null;
    }>;
  };
  journalEntryCount: number;
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

