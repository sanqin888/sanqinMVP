export const ORDER_REPORTING_FACTS_READER = Symbol(
  'ORDER_REPORTING_FACTS_READER',
);

export type OrderReportingMetricFactV1 = {
  createdAt: Date;
  totalCents: number;
};

export type OrderReportingBreakdownFactV1 = {
  name: string | null;
  totalCents: number;
};

export type OrderReportingMetricsV1 = {
  totalCents: number;
  subtotalCents: number;
  taxCents: number;
  deliveryFeeCents: number;
  orderCount: number;
  payment: OrderReportingBreakdownFactV1[];
  fulfillment: OrderReportingBreakdownFactV1[];
  timeline: OrderReportingMetricFactV1[];
};

export type OrderReportingItemComponentFactV1 = {
  productStableId: string;
  nameEn: string | null;
  nameZh: string | null;
  quantityPerParent: number;
};

export type OrderReportingItemFactV1 = {
  qty: number;
  productStableId: string;
  displayName: string | null;
  nameEn: string | null;
  nameZh: string | null;
  components: OrderReportingItemComponentFactV1[];
};

export type OrderPaidTotalDimensionFactV1 = {
  key: string;
  amountCents: number;
};

/**
 * Legacy/reporting projection of persisted Order.totalCents for paidAt-bounded
 * dimension views. This is intentionally not a canonical revenue fact.
 */
export type OrderPaidTotalDimensionsV1 = {
  byChannel: OrderPaidTotalDimensionFactV1[];
  byPaymentMethod: OrderPaidTotalDimensionFactV1[];
};

export interface OrderReportingFactsReaderPort {
  readMetricsForRange(
    startDate: Date,
    endDate: Date,
  ): Promise<OrderReportingMetricsV1>;
  readItemsForRange(
    startDate: Date,
    endDate: Date,
  ): Promise<OrderReportingItemFactV1[]>;
  readPaidTotalDimensionsForRange(
    startDate?: Date,
    endDate?: Date,
  ): Promise<OrderPaidTotalDimensionsV1>;
}
