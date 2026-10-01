import type {
  ReportingMarketingCampaignKindV1,
  ReportingMarketingCampaignScopeV1,
} from './reporting-marketing-campaigns-query.contract';

export type MarketingOverviewWindowKeyV1 =
  | 'today'
  | 'last7Days'
  | 'last30Days'
  | 'last90Days';

export type MarketingOverviewMetricCoverageV1 =
  | 'COMPLETE'
  | 'PARTIAL'
  | 'UNAVAILABLE'
  | 'NOT_APPLICABLE';

export type MarketingOverviewMetricV1 = {
  value: number | null;
  coverage: MarketingOverviewMetricCoverageV1;
  coveredUses: number;
  totalUses: number;
};

export type MarketingOverviewAssociatedSalesEvidenceV1 =
  | 'NO_USAGE'
  | 'IMMUTABLE_ONLY'
  | 'INCLUDES_LEGACY_CURRENT_ORDER';

export type MarketingOverviewWindowMetricsV1 = {
  uses: number;
  affectedItemQuantity: MarketingOverviewMetricV1;
  discountCents: MarketingOverviewMetricV1;
  associatedSalesCents: number;
  associatedSalesEvidence: MarketingOverviewAssociatedSalesEvidenceV1;
};

export type MarketingOverviewWindowV1 = {
  fromInclusive: string;
  toExclusive: string;
};

export type MarketingOverviewActivityV1 = {
  activityStableId: string;
  kind: ReportingMarketingCampaignKindV1;
  scope: ReportingMarketingCampaignScopeV1;
  storeStableId: string | null;
  titleZh: string;
  titleEn: string | null;
  subtype: string;
  validFrom: string | null;
  validTo: string | null;
  weekdays: number[];
  startMinutes: number | null;
  endMinutes: number | null;
  metrics: Record<
    MarketingOverviewWindowKeyV1,
    MarketingOverviewWindowMetricsV1
  >;
};

export type MarketingOverviewReportV1 = {
  version: 1;
  storeStableId: string;
  timezone: string;
  generatedAt: string;
  windows: Record<MarketingOverviewWindowKeyV1, MarketingOverviewWindowV1>;
  activities: MarketingOverviewActivityV1[];
  coverage: {
    unattributedCouponUsesInLast90Days: number;
  };
};
