// apps/api/src/orders/dto/order-summary.dto.ts
import { OrderItemOptionsSnapshot } from '../order-item-options';
export type OrderSummaryLineItemDto = {
  // ✅ 对外统一：引用菜品 stableId
  productStableId: string;
  name: string;
  nameEn: string | null;
  nameZh: string | null;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
  optionsJson?: OrderItemOptionsSnapshot | null;
};

export type OrderSummaryDto = {
  orderStableId: string;
  orderNumber: string;
  currency: 'CAD';
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
