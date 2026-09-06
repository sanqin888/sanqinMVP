export const ORDER_INVOICE_DELIVERY = Symbol('ORDER_INVOICE_DELIVERY');

export type OrderInvoiceLocale = 'zh' | 'en';

export type OrderInvoicePaymentMethod =
  | 'cash'
  | 'card'
  | 'wechat_alipay'
  | 'store_balance'
  | 'ubereats';

export type OrderInvoiceDiscountSource =
  | 'DAILY_SPECIAL'
  | 'COUPON'
  | 'AUTOMATIC_PROMOTION'
  | 'POS_MANUAL_DISCOUNT'
  | 'OTHER';

export type OrderInvoiceDiscountEntry = {
  promotionStableId: string | null;
  source: OrderInvoiceDiscountSource;
  title: string | null;
  titleZh: string | null;
  titleEn: string | null;
  productStableId: string | null;
  productName: string | null;
  productNameZh: string | null;
  productNameEn: string | null;
  discountCents: number;
};

export type OrderInvoiceOptionChoiceSnapshot = {
  stableId: string;
  templateGroupStableId: string;
  targetItemStableId?: string | null;
  nameEn: string | null;
  nameZh: string | null;
  displayName?: string | null;
  priceDeltaCents: number;
  sortOrder: number;
};

export type OrderInvoiceOptionGroupSnapshot = {
  templateGroupStableId: string;
  groupKey?: string | null;
  nameEn: string | null;
  nameZh: string | null;
  displayName?: string | null;
  minSelect: number;
  maxSelect: number | null;
  sortOrder: number;
  choices: OrderInvoiceOptionChoiceSnapshot[];
};

export type OrderInvoiceOptionsSnapshot = OrderInvoiceOptionGroupSnapshot[];

export type OrderInvoiceComponentSnapshot = {
  productStableId: string;
  nameZh: string | null;
  nameEn: string | null;
  quantity: number;
  priceDeltaCents: number;
  source: 'FIXED' | 'OPTION';
  sourceOptionStableId?: string | null;
  options: OrderInvoiceOptionsSnapshot;
};

export type OrderInvoiceItemSnapshot = {
  productStableId: string;
  nameZh: string | null;
  nameEn: string | null;
  displayName: string | null;
  quantity: number;
  lineTotalCents: number;
  specialInstructions: string | null;
  options: OrderInvoiceOptionsSnapshot | null;
  components: OrderInvoiceComponentSnapshot[];
};

export type OrderInvoiceUtensilsSnapshot = {
  needed: boolean;
  type: string | null;
  quantity: number | null;
  summary: string | null;
};

export type OrderInvoicePayload = {
  locale: OrderInvoiceLocale;
  orderNumber: string;
  customerName: string | null;
  pickupCode: string | null;
  fulfillment: 'pickup' | 'dine_in' | 'delivery';
  paymentMethod: OrderInvoicePaymentMethod;
  orderNotes: string | null;
  utensils: OrderInvoiceUtensilsSnapshot | null;
  cashReceivedCents?: number;
  cashChangeCents?: number;
  snapshot: {
    items: OrderInvoiceItemSnapshot[];
    subtotalCents: number;
    displaySubtotalCents: number;
    appliedDiscounts: OrderInvoiceDiscountEntry[];
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
};

export type OrderInvoiceDeliveryInput = {
  to: string;
  payload: OrderInvoicePayload;
  locale?: string;
};

export type OrderInvoiceDeliveryResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
  sendId: string;
};

export interface OrderInvoiceDeliveryPort {
  sendOrderInvoice(
    input: OrderInvoiceDeliveryInput,
  ): Promise<OrderInvoiceDeliveryResult>;
}
