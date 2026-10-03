export type AccountingSalesFinancialProvider =
  | 'CLOVER'
  | 'UBER_EATS'
  | 'FANTUAN';

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
  | 'external'
  | 'UNATTRIBUTED_PROVIDER'
  | 'UNATTRIBUTED';

export type AccountingSalesAnalyticsPrimaryPaymentMethod =
  | 'CASH'
  | 'CARD'
  | 'WECHAT_ALIPAY'
  | 'STORE_BALANCE'
  | 'UBEREATS'
  | 'FANTUAN'
  | 'NOT_APPLICABLE'
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
  | 'HISTORICAL_REPLACEMENT_REVERSAL'
  | 'EXTERNAL_SALE'
  | 'EXTERNAL_SALE_REVERSAL';

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
  byExternalClassification: Array<AccountingSalesDimensionRow<string>>;
  attribution: {
    immutableOrderAttributedJournalEntries: number;
    legacyOrderAttributedJournalEntries: number;
    missingOrderAttributedJournalEntries: number;
    worstQuality: AccountingSalesAttributionQuality | null;
  };
  providerCoverage: {
    overall: AccountingSalesProviderCoverageStatus;
    providers: Array<{
      provider: AccountingSalesFinancialProvider;
      status: AccountingSalesProviderCoverageStatus;
      financialHistoryRequiredFrom: string | null;
      financialCompleteThrough: string | null;
    }>;
  };
  journalEntryCount: number;
};
