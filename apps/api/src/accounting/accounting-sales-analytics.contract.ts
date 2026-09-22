import type { AccountingFinancialProvider } from './accounting-contracts';
import type {
  AccountingSalesAttributionQualityV1,
  AccountingSalesProviderCoverageStatusV1,
  AccountingSalesSummaryV1,
  AccountingSalesTenderBucketV1,
} from './accounting-sales-analytics.policy';

export type AccountingSalesAnalyticsChannelV1 =
  | 'web'
  | 'in_store'
  | 'ubereats'
  | 'fantuan'
  | 'UNATTRIBUTED_PROVIDER'
  | 'UNATTRIBUTED';

export type AccountingSalesAnalyticsPrimaryPaymentMethodV1 =
  | 'CASH'
  | 'CARD'
  | 'WECHAT_ALIPAY'
  | 'STORE_BALANCE'
  | 'UBEREATS'
  | 'FANTUAN'
  | 'UNATTRIBUTED';

export type AccountingSalesAnalyticsSourceBucketV1 =
  | 'ORDER_SALE'
  | 'ORDER_CHANGE'
  | 'PROVIDER_STATEMENT'
  | 'HISTORICAL_REPLACEMENT_REVERSAL';

export type AccountingSalesAnalyticsDimensionRowV1<T extends string> = {
  key: T;
  journalEntryCount: number;
  summary: AccountingSalesSummaryV1;
};

export type AccountingSalesAnalyticsTenderRowV1 = {
  tender: AccountingSalesTenderBucketV1;
  amountCents: number;
};

export type AccountingSalesAnalyticsCoverageRowV1 = {
  provider: AccountingFinancialProvider;
  status: AccountingSalesProviderCoverageStatusV1;
  financialHistoryRequiredFrom: string | null;
  financialCompleteThrough: string | null;
};

export type AccountingSalesAnalyticsReportV1 = {
  version: 1;
  storeStableId: string;
  timezone: string;
  from: string;
  to: string;
  summary: AccountingSalesSummaryV1;
  daily: Array<{
    date: string;
    journalEntryCount: number;
    summary: AccountingSalesSummaryV1;
  }>;
  byChannel: Array<
    AccountingSalesAnalyticsDimensionRowV1<AccountingSalesAnalyticsChannelV1>
  >;
  byPrimaryPaymentMethod: Array<
    AccountingSalesAnalyticsDimensionRowV1<AccountingSalesAnalyticsPrimaryPaymentMethodV1>
  >;
  tenderMix: AccountingSalesAnalyticsTenderRowV1[];
  bySource: Array<
    AccountingSalesAnalyticsDimensionRowV1<AccountingSalesAnalyticsSourceBucketV1>
  >;
  attribution: {
    immutableOrderAttributedJournalEntries: number;
    legacyOrderAttributedJournalEntries: number;
    missingOrderAttributedJournalEntries: number;
    worstQuality: AccountingSalesAttributionQualityV1 | null;
  };
  providerCoverage: {
    overall: AccountingSalesProviderCoverageStatusV1;
    providers: AccountingSalesAnalyticsCoverageRowV1[];
  };
  journalEntryCount: number;
};
