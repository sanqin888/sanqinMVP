// apps/api/src/orders/dto/order-summary.dto.ts
export type OrderSummaryLineItemDto = {
  // ✅ 对外统一：引用菜品 stableId
  productStableId: string;

  name: string;
  nameEn: string | null;
  nameZh: string | null;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
  optionsJson?: unknown;
};

export type OrderSummaryDto = {
  orderId: string;
  clientRequestId: string | null;
  orderNumber: string;
  currency: string;

  subtotalCents: number;
  taxCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;

  loyaltyRedeemCents?: number | null;
  couponDiscountCents?: number | null;
  subtotalAfterDiscountCents?: number | null;

  lineItems: OrderSummaryLineItemDto[];
};
