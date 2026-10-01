export const REPORTING_MARKETING_CAMPAIGNS_QUERY = Symbol(
  'REPORTING_MARKETING_CAMPAIGNS_QUERY',
);

export type ReportingMarketingCampaignKindV1 =
  | 'DAILY_SPECIAL'
  | 'PROMOTION_RULE'
  | 'COUPON_PROGRAM';

export type ReportingMarketingCampaignScopeV1 = 'STORE' | 'BRAND';

export type ReportingMarketingCampaignLifecycleStatusV1 =
  | 'DRAFT'
  | 'ACTIVE'
  | 'PAUSED'
  | 'ENDED';

export type ReportingMarketingCampaignFactV1 = {
  activityStableId: string;
  kind: ReportingMarketingCampaignKindV1;
  scope: ReportingMarketingCampaignScopeV1;
  storeStableId: string | null;
  titleZh: string;
  titleEn: string | null;
  subtype: string;
  lifecycleStatus: ReportingMarketingCampaignLifecycleStatusV1;
  validFrom: Date | null;
  validTo: Date | null;
  weekdays: number[];
  startMinutes: number | null;
  endMinutes: number | null;
};

export type ReportingMarketingCouponProgramAttributionV1 = {
  couponStableId: string;
  programStableId: string;
};

export interface ReportingMarketingCampaignsQueryPort {
  readCampaigns(query: {
    storeStableId: string;
  }): Promise<ReportingMarketingCampaignFactV1[]>;
  readCouponProgramAttributions(
    couponStableIds: readonly string[],
  ): Promise<ReportingMarketingCouponProgramAttributionV1[]>;
}
