import type {
  AccountingFinancialComponent,
  AccountingFinancialProvider,
} from './accounting-contracts';

export type AccountingPlatformAnalyticsProviderKeyV1 = Extract<
  AccountingFinancialProvider,
  'UBER_EATS' | 'FANTUAN'
>;

export type AccountingPlatformAnalyticsCoverageStatusV1 =
  | 'COMPLETE'
  | 'PARTIAL'
  | 'EMPTY';

export type AccountingPlatformAnalyticsPeriodStatusV1 =
  | 'AVAILABLE'
  | 'MISSING'
  | 'AMBIGUOUS'
  | 'INCOMPLETE';

export type AccountingPlatformAnalyticsCostKindV1 =
  | 'CHARGE'
  | 'CREDIT'
  | 'NEUTRAL';

export type AccountingPlatformAnalyticsCommissionV1 = {
  rawNames: string[];
  amountCents: number;
  costImpactCents: number;
  shareOfSalesBps: number | null;
};

export type AccountingPlatformAnalyticsFeeV1 = {
  categoryKey: string;
  rawName: string;
  component: AccountingFinancialComponent;
  amountCents: number;
  costImpactCents: number;
  shareOfSalesBps: number | null;
  kind: AccountingPlatformAnalyticsCostKindV1;
};

export type AccountingPlatformAnalyticsAvailablePeriodV1 = {
  month: string;
  status: 'AVAILABLE';
  documentStableId: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  salesCents: number;
  commission: AccountingPlatformAnalyticsCommissionV1;
  fees: AccountingPlatformAnalyticsFeeV1[];
  totalPlatformCostExTaxCents: number;
  totalPlatformCostShareOfSalesBps: number | null;
};

export type AccountingPlatformAnalyticsUnavailablePeriodV1 = {
  month: string;
  status: 'MISSING' | 'AMBIGUOUS' | 'INCOMPLETE';
  documentStableIds: string[];
  issues: string[];
};

export type AccountingPlatformAnalyticsPeriodV1 =
  | AccountingPlatformAnalyticsAvailablePeriodV1
  | AccountingPlatformAnalyticsUnavailablePeriodV1;

export type AccountingPlatformAnalyticsProviderV1 = {
  provider: AccountingPlatformAnalyticsProviderKeyV1;
  latestMonth: string | null;
  coverage: AccountingPlatformAnalyticsCoverageStatusV1;
  periods: AccountingPlatformAnalyticsPeriodV1[];
};

export type AccountingPlatformAnalyticsReportV1 = {
  version: 1;
  storeStableId: string;
  timezone: string;
  providers: AccountingPlatformAnalyticsProviderV1[];
};
