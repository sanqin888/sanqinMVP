// apps/api/src/orders/dto/order-summary.dto.ts
import { OrderItemOptionsSnapshot } from '../order-item-options';
import type { OrderStatus } from '../order-status';
import type {
  FulfillmentType,
  OrderDiscountDisplayEntry,
} from '@shared/order';
import type { OrderItemComponentDisplaySnapshot } from '../order-item-components';
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
  displayOptions?: OrderItemOptionsSnapshot | null;
  components?: OrderItemComponentDisplaySnapshot[];
};

export type OrderSummaryDto = {
  orderStableId: string;
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  fulfillmentType: FulfillmentType;
  itemCount: number;
  currency: 'CAD';
  subtotalCents: number;
  displaySubtotalCents: number;
  appliedDiscounts: OrderDiscountDisplayEntry[];
  taxCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  orderTotalCents: number;
  paymentTotalCents: number;
  externalPaidCents: number;

  loyaltyRedeemCents?: number | null;
  couponDiscountCents?: number | null;
  subtotalAfterDiscountCents?: number | null;
  creditCardSurchargeCents?: number;
  creditCardSurchargeRate?: number;
  chargeStatusUnverified?: boolean;
  chargeStatusUnverifiedReason?: string;
  balancePaidCents?: number;
  pointsEarned?: number;

  lineItems: OrderSummaryLineItemDto[];
};
