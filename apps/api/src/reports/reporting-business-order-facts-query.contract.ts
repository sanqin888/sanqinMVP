export const REPORTING_BUSINESS_ORDER_FACTS_QUERY = Symbol(
  'REPORTING_BUSINESS_ORDER_FACTS_QUERY',
);

export type ReportingBusinessOrderRangeV1 = {
  storeStableId: string;
  fromInclusive: Date;
  toExclusive: Date;
};

export type ReportingBusinessOrderStatusV1 =
  | 'paid'
  | 'making'
  | 'ready'
  | 'completed';

export type ReportingBusinessOrderChannelV1 =
  | 'web'
  | 'in_store'
  | 'ubereats';

export type ReportingBusinessOrderPaymentMethodV1 =
  | 'CASH'
  | 'CARD'
  | 'WECHAT_ALIPAY'
  | 'STORE_BALANCE'
  | 'UBEREATS';

export type ReportingBusinessOrderFulfillmentV1 =
  | 'pickup'
  | 'dine_in'
  | 'delivery';

export type ReportingBusinessOrderFactV1 = {
  orderStableId: string;
  storeStableId: string;
  status: ReportingBusinessOrderStatusV1;
  createdAt: Date;
  paidAt: Date;
  makingAt: Date | null;
  readyAt: Date | null;
  totalCents: number;
  subtotalCents: number;
  taxCents: number;
  customerDeliveryFeeCents: number;
  channel: ReportingBusinessOrderChannelV1;
  primaryPaymentMethod: ReportingBusinessOrderPaymentMethodV1;
  fulfillmentType: ReportingBusinessOrderFulfillmentV1;
};

export type ReportingBusinessItemComponentFactV1 = {
  productStableId: string;
  nameEn: string | null;
  nameZh: string | null;
  quantityPerParent: number;
};

export type ReportingBusinessOrderItemFactV1 = {
  orderStableId: string;
  orderCreatedAt: Date;
  qty: number;
  productStableId: string;
  displayName: string | null;
  nameEn: string | null;
  nameZh: string | null;
  unitPriceCents: number | null;
  isDailySpecialApplied: boolean;
  components: ReportingBusinessItemComponentFactV1[];
};

export interface ReportingBusinessOrderFactsQueryPort {
  readOperationalOrdersForRange(
    query: ReportingBusinessOrderRangeV1,
  ): Promise<ReportingBusinessOrderFactV1[]>;
  readOperationalItemsForRange(
    query: ReportingBusinessOrderRangeV1,
  ): Promise<ReportingBusinessOrderItemFactV1[]>;
}
