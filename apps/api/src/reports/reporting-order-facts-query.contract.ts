export const REPORTING_ORDER_FACTS_QUERY = Symbol(
  'REPORTING_ORDER_FACTS_QUERY',
);

export type ReportingOrderMetricFactV1 = {
  createdAt: Date;
  totalCents: number;
};

export type ReportingOrderBreakdownFactV1 = {
  name: string | null;
  totalCents: number;
};

export type ReportingOrderMetricsV1 = {
  totalCents: number;
  subtotalCents: number;
  taxCents: number;
  deliveryFeeCents: number;
  orderCount: number;
  payment: ReportingOrderBreakdownFactV1[];
  fulfillment: ReportingOrderBreakdownFactV1[];
  timeline: ReportingOrderMetricFactV1[];
};

export type ReportingOrderItemComponentFactV1 = {
  productStableId: string;
  nameEn: string | null;
  nameZh: string | null;
  quantityPerParent: number;
};

export type ReportingOrderItemFactV1 = {
  qty: number;
  productStableId: string;
  displayName: string | null;
  nameEn: string | null;
  nameZh: string | null;
  components: ReportingOrderItemComponentFactV1[];
};

export interface ReportingOrderFactsQueryPort {
  readMetricsForRange(
    startDate: Date,
    endDate: Date,
  ): Promise<ReportingOrderMetricsV1>;
  readItemsForRange(
    startDate: Date,
    endDate: Date,
  ): Promise<ReportingOrderItemFactV1[]>;
}
