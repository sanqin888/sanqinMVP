export const REPORTING_MARKETING_USAGE_QUERY = Symbol(
  'REPORTING_MARKETING_USAGE_QUERY',
);

export type ReportingMarketingUsageSourceV1 =
  | 'DAILY_SPECIAL'
  | 'AUTOMATIC_PROMOTION'
  | 'COUPON'
  | 'LOYALTY_PROMOTION';

export type ReportingMarketingMetricEvidenceV1 =
  | 'COMPLETE'
  | 'UNAVAILABLE'
  | 'NOT_APPLICABLE';

export type ReportingMarketingSaleEvidenceV1 =
  | 'IMMUTABLE_SALE_SNAPSHOT'
  | 'LEGACY_CURRENT_ORDER';

export type ReportingMarketingUsageFactV1 = {
  orderStableId: string;
  storeStableId: string | null;
  occurredAt: Date;
  activityStableId: string;
  source: ReportingMarketingUsageSourceV1;
  affectedItemQuantity: number | null;
  affectedItemQuantityEvidence: ReportingMarketingMetricEvidenceV1;
  discountCents: number | null;
  discountEvidence: ReportingMarketingMetricEvidenceV1;
  associatedSalesCents: number;
  associatedSalesEvidence: ReportingMarketingSaleEvidenceV1;
};

export interface ReportingMarketingUsageQueryPort {
  readUsageFactsForRange(query: {
    storeStableId: string;
    fromInclusive: Date;
    toExclusive: Date;
  }): Promise<ReportingMarketingUsageFactV1[]>;
}
