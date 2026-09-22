import type { AccountingCategory } from './chart';
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
