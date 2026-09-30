export const MARKETING_CAMPAIGN_FACTS_READER = Symbol(
  'MARKETING_CAMPAIGN_FACTS_READER',
);

export type MarketingCampaignKindV1 =
  | 'DAILY_SPECIAL'
  | 'PROMOTION_RULE'
  | 'COUPON_PROGRAM';

export type MarketingCampaignScopeV1 = 'STORE' | 'BRAND';

export type MarketingCampaignLifecycleStatusV1 =
  | 'DRAFT'
  | 'ACTIVE'
  | 'PAUSED'
  | 'ENDED';

export type MarketingCampaignFactV1 = {
  version: 1;
  activityStableId: string;
  kind: MarketingCampaignKindV1;
  scope: MarketingCampaignScopeV1;
  storeStableId: string | null;
  titleZh: string;
  titleEn: string | null;
  subtype: string;
  lifecycleStatus: MarketingCampaignLifecycleStatusV1;
  validFrom: Date | null;
  validTo: Date | null;
  weekdays: number[];
  startMinutes: number | null;
  endMinutes: number | null;
};

export type MarketingCouponProgramAttributionV1 = {
  couponStableId: string;
  programStableId: string;
};

export interface MarketingCampaignFactsReaderPort {
  readCampaigns(query?: {
    storeStableId?: string;
  }): Promise<MarketingCampaignFactV1[]>;
  readCouponProgramAttributions(
    couponStableIds: readonly string[],
  ): Promise<MarketingCouponProgramAttributionV1[]>;
}
