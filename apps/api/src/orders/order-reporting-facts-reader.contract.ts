export const ORDER_REPORTING_FACTS_READER = Symbol(
  'ORDER_REPORTING_FACTS_READER',
);

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

export type OrderReportingOperationalRangeV1 = {
  storeStableId: string;
  fromInclusive: Date;
  toExclusive: Date;
};

export type OrderReportingOperationalStatusV1 =
  | 'paid'
  | 'making'
  | 'ready'
  | 'completed';

export type OrderReportingOperationalChannelV1 =
  | 'web'
  | 'in_store'
  | 'ubereats';

export type OrderReportingOperationalPaymentMethodV1 =
  | 'CASH'
  | 'CARD'
  | 'WECHAT_ALIPAY'
  | 'STORE_BALANCE'
  | 'UBEREATS';

export type OrderReportingOperationalFulfillmentV1 =
  | 'pickup'
  | 'dine_in'
  | 'delivery';

export type OrderReportingOperationalOrderFactV1 = {
  orderStableId: string;
  storeStableId: string;
  status: OrderReportingOperationalStatusV1;
  createdAt: Date;
  paidAt: Date;
  makingAt: Date | null;
  readyAt: Date | null;
  totalCents: number;
  subtotalCents: number;
  taxCents: number;
  customerDeliveryFeeCents: number;
  channel: OrderReportingOperationalChannelV1;
  primaryPaymentMethod: OrderReportingOperationalPaymentMethodV1;
  fulfillmentType: OrderReportingOperationalFulfillmentV1;
};

export type OrderReportingOperationalItemFactV1 = {
  orderStableId: string;
  orderCreatedAt: Date;
  qty: number;
  productStableId: string;
  displayName: string | null;
  nameEn: string | null;
  nameZh: string | null;
  unitPriceCents: number | null;
  isDailySpecialApplied: boolean;
  components: OrderReportingItemComponentFactV1[];
};

export interface OrderReportingFactsReaderPort {
  readItemsForRange(
    startDate: Date,
    endDate: Date,
  ): Promise<OrderReportingItemFactV1[]>;
  readOperationalOrdersForRange(
    query: OrderReportingOperationalRangeV1,
  ): Promise<OrderReportingOperationalOrderFactV1[]>;
  readOperationalItemsForRange(
    query: OrderReportingOperationalRangeV1,
  ): Promise<OrderReportingOperationalItemFactV1[]>;
}
