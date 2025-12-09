// apps/api/src/orders/dto/order-summary.dto.ts

export type OrderSummaryLineItemDto = {
  productId: string;
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

  // 原有字段
  subtotalCents: number;
  taxCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;

  // ✅ 新增：把订单里实际的积分 + 优惠券拆开返回（可选字段，兼容旧数据）
  loyaltyRedeemCents?: number | null;
  couponDiscountCents?: number | null;
  subtotalAfterDiscountCents?: number | null;

  lineItems: OrderSummaryLineItemDto[];
};
