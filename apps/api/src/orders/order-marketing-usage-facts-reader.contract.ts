export const ORDER_MARKETING_USAGE_FACTS_READER = Symbol(
  'ORDER_MARKETING_USAGE_FACTS_READER',
);

export type OrderMarketingActivitySourceV1 =
  | 'DAILY_SPECIAL'
  | 'AUTOMATIC_PROMOTION'
  | 'COUPON'
  | 'LOYALTY_PROMOTION';

export type OrderMarketingMetricEvidenceV1 =
  | 'COMPLETE'
  | 'UNAVAILABLE'
  | 'NOT_APPLICABLE';

export type OrderMarketingAssociatedSalesEvidenceV1 =
  | 'IMMUTABLE_SALE_SNAPSHOT'
  | 'LEGACY_CURRENT_ORDER';

export type OrderMarketingUsageFactV1 = {
  version: 1;
  orderStableId: string;
  storeStableId: string | null;
  occurredAt: Date;
  activityStableId: string;
  source: OrderMarketingActivitySourceV1;
  affectedItemQuantity: number | null;
  affectedItemQuantityEvidence: OrderMarketingMetricEvidenceV1;
  discountCents: number | null;
  discountEvidence: OrderMarketingMetricEvidenceV1;
  /**
   * Order merchandise subtotal after order promotions/coupons/points, before
   * tax, customer delivery fee and card surcharge. This is associated sales,
   * not causal/incremental revenue, and must not be summed across campaigns.
   */
  associatedSalesCents: number;
  associatedSalesEvidence: OrderMarketingAssociatedSalesEvidenceV1;
};

export type OrderMarketingUsageRangeV1 = {
  fromInclusive: Date;
  toExclusive: Date;
  storeStableId?: string;
};

export interface OrderMarketingUsageFactsReaderPort {
  readUsageFactsForRange(
    range: OrderMarketingUsageRangeV1,
  ): Promise<OrderMarketingUsageFactV1[]>;
}
