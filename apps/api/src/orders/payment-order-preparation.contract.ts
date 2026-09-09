import type {
  CreateOrderInput,
  OrderDiscountDisplayEntry,
} from '@shared/order';

export const PAYMENT_ORDER_PREPARATION = Symbol('PAYMENT_ORDER_PREPARATION');

export type OrderPricingQuote = {
  subtotalCents: number;
  displaySubtotalCents: number;
  couponDiscountCents: number;
  automaticPromotionDiscountCents: number;
  posManualDiscountCents: number;
  loyaltyRedeemCents: number;
  taxCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  appliedDiscounts: OrderDiscountDisplayEntry[];
};

export type PaymentTenderAllocation = {
  pointsCents: number;
  balanceCents: number;
  couponDiscountCents: number;
  orderTotalCents: number;
  externalCents: number;
};

export type PreparedPaymentOrderItemSnapshot = {
  productStableId: string;
  qty: number;
  displayName: string | null;
  nameEn: string | null;
  nameZh: string | null;
  unitPriceCents: number;
  baseUnitPriceCents: number;
  optionsUnitPriceCents: number;
  isDailySpecialApplied: boolean;
  dailySpecialStableId: string | null;
  optionsJson: unknown;
  componentsJson?: unknown;
};

/** Persisted cross-context payment draft. V2 must contain business/stable identities only. */
export type PreparedPaymentOrderSnapshot = {
  version: 2;
  order: {
    userStableId: string | null;
    channel: CreateOrderInput['channel'];
    fulfillmentType: CreateOrderInput['fulfillmentType'];
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  };
  /** Business store identity: Store.storeStableId, matching Order.storeId. */
  storeStableId: string;
  pricing: OrderPricingQuote;
  tender: PaymentTenderAllocation;
  items: PreparedPaymentOrderItemSnapshot[];
  promotionSnapshot: unknown;
  coupon: {
    couponStableId: string;
    reserveAssignedCoupon: boolean;
    code: string;
    title: string;
    minSpendCents: number | null;
    expiresAt: string | null;
  } | null;
  preparedAt: string;
};

export interface PaymentOrderPreparationPort {
  preparePaymentOrder(
    dto: CreateOrderInput,
    storeStableId: string,
  ): Promise<PreparedPaymentOrderSnapshot>;
}
