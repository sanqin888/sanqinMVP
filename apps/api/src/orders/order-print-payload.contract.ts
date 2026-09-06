import type { FulfillmentType, OrderDiscountDisplayEntry } from '@shared/order';
import type { OrderItemOptionsSnapshot } from './order-item-options';

export const ORDER_PRINT_PAYLOAD_READER = Symbol('ORDER_PRINT_PAYLOAD_READER');

export type PrintPosPaymentMethod =
  | 'cash'
  | 'card'
  | 'wechat_alipay'
  | 'store_balance'
  | 'ubereats';

export type PrintPosComponentSnapshot = {
  productStableId: string;
  nameZh: string | null;
  nameEn: string | null;
  quantity: number;
  priceDeltaCents: number;
  source: 'FIXED' | 'OPTION';
  sourceOptionStableId?: string | null;
  options: OrderItemOptionsSnapshot;
};

export type PrintPosItemSnapshot = {
  productStableId: string;
  nameZh: string | null;
  nameEn: string | null;
  displayName: string | null;
  quantity: number;
  lineTotalCents: number;
  specialInstructions: string | null;
  options: OrderItemOptionsSnapshot | null;
  components: PrintPosComponentSnapshot[];
};

export type PrintPosUtensilsSnapshot = {
  needed: boolean;
  type: string | null;
  quantity: number | null;
  summary: string | null;
};

export type PrintPosOrderSnapshot = {
  items: PrintPosItemSnapshot[];
  subtotalCents: number;
  displaySubtotalCents: number;
  appliedDiscounts: OrderDiscountDisplayEntry[];
  loyaltyRedeemCents: number;
  taxCents: number;
  orderTotalCents: number;
  balancePaidCents: number;
  externalPaidCents: number;
  totalCents: number;
  creditCardSurchargeCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  deliveryCostCents: number;
  deliverySubsidyCents: number;
};

export type PrintPosPayloadDto = {
  locale: 'zh' | 'en';
  orderNumber: string;
  customerName: string | null;
  pickupCode: string | null;
  fulfillment: FulfillmentType;
  paymentMethod: PrintPosPaymentMethod;
  orderNotes: string | null;
  utensils: PrintPosUtensilsSnapshot | null;
  cashReceivedCents?: number;
  cashChangeCents?: number;
  snapshot: PrintPosOrderSnapshot;
};

export interface OrderPrintPayloadReaderPort {
  getByStableId(
    orderStableId: string,
    locale?: string,
  ): Promise<PrintPosPayloadDto>;
}
