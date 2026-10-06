export type AccountingPlatformAnalyticsProviderKey =
  | 'UBER_EATS'
  | 'FANTUAN';

export type AccountingPlatformFinancialComponent =
  | 'SALES'
  | 'SALES_TAX'
  | 'REFUND'
  | 'TIP'
  | 'COMMISSION'
  | 'COMMISSION_TAX'
  | 'PROCESSING_FEE'
  | 'PROCESSING_FEE_TAX'
  | 'PROMOTION'
  | 'SUBSIDY'
  | 'ADVERTISING'
  | 'ADVERTISING_TAX'
  | 'ADVERTISING_CREDIT'
  | 'CHARGEBACK'
  | 'CHARGEBACK_TAX'
  | 'PLATFORM_OTHER_FEE'
  | 'PLATFORM_OTHER_FEE_TAX'
  | 'ADJUSTMENT'
  | 'PAYOUT'
  | 'CONTROL_TOTAL'
  | 'OTHER';

export type AccountingPlatformAnalyticsCostKind =
  | 'CHARGE'
  | 'CREDIT'
  | 'NEUTRAL';

export type AccountingPlatformAnalyticsCommission = {
  rawNames: string[];
  amountCents: number;
  costImpactCents: number;
  shareOfSalesBps: number | null;
};

export type AccountingPlatformAnalyticsFee = {
  categoryKey: string;
  rawName: string;
  component: AccountingPlatformFinancialComponent;
  amountCents: number;
  costImpactCents: number;
  shareOfSalesBps: number | null;
  kind: AccountingPlatformAnalyticsCostKind;
};

export type AccountingPlatformAnalyticsAvailablePeriod = {
  month: string;
  status: 'AVAILABLE';
  documentStableId: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  salesCents: number;
  commission: AccountingPlatformAnalyticsCommission;
  fees: AccountingPlatformAnalyticsFee[];
  totalPlatformCostExTaxCents: number;
  totalPlatformCostShareOfSalesBps: number | null;
};

export type AccountingPlatformAnalyticsUnavailablePeriod = {
  month: string;
  status: 'MISSING' | 'AMBIGUOUS' | 'INCOMPLETE';
  documentStableIds: string[];
  issues: string[];
};

export type AccountingPlatformAnalyticsPeriod =
  | AccountingPlatformAnalyticsAvailablePeriod
  | AccountingPlatformAnalyticsUnavailablePeriod;

export type AccountingPlatformAnalyticsProvider = {
  provider: AccountingPlatformAnalyticsProviderKey;
  latestMonth: string | null;
  coverage: 'COMPLETE' | 'PARTIAL' | 'EMPTY';
  periods: AccountingPlatformAnalyticsPeriod[];
};

export type AccountingPlatformAnalyticsReport = {
  version: 1;
  storeStableId: string;
  timezone: string;
  providers: AccountingPlatformAnalyticsProvider[];
};
