import type {
  Channel,
  FulfillmentType,
  OrderJsonValue,
  OrderStatus,
  PaymentMethod,
} from '@shared/order';

export const POS_ORDER_READ = Symbol('POS_ORDER_READ');

export type PosOrderFinancialSummaryQuery = {
  storeStableId: string;
  paidFrom: Date;
  paidToExclusive: Date;
  fulfillmentType?: FulfillmentType;
};

export type PosOrderFinancialSummaryRecord = {
  orderStableId: string;
  clientRequestId: string | null;
  paidAt: Date;
  channel: Channel;
  fulfillmentType: FulfillmentType;
  status: OrderStatus;
  subtotalCents: number;
  subtotalAfterDiscountCents: number;
  totalCents: number;
  taxCents: number;
  deliveryFeeCents: number;
  deliveryCostCents: number;
  paymentMethod: PaymentMethod | null;
  refundCents: number;
  additionalChargeCents: number;
};

export type OrderAmendmentReadType =
  | 'RETENDER'
  | 'VOID_ITEM'
  | 'SWAP_ITEM'
  | 'ADDITIONAL_CHARGE';

export type OrderAmendmentItemReadAction = 'VOID' | 'ADD';

export type PosOrderAmendmentReadRecord = {
  amendmentStableId: string;
  type: OrderAmendmentReadType;
  paymentMethod: PaymentMethod | null;
  reason: string;
  deltaCents: number;
  refundCents: number;
  additionalChargeCents: number;
  summaryJson: OrderJsonValue | null;
  items: Array<{
    action: OrderAmendmentItemReadAction;
    productStableId: string;
    displayName: string | null;
    nameEn: string | null;
    nameZh: string | null;
    qty: number;
    unitPriceCents: number | null;
    optionsJson: OrderJsonValue | null;
  }>;
};

export interface PosOrderReadPort {
  listFinancialSummaryOrders(
    query: PosOrderFinancialSummaryQuery,
  ): Promise<PosOrderFinancialSummaryRecord[]>;

  listAmendmentsForStore(
    orderStableId: string,
    storeStableId: string,
  ): Promise<PosOrderAmendmentReadRecord[]>;
}
