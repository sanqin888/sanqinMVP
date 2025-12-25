//apps/api/src/orders/dto/order.dto.ts
import type {
  Channel,
  DeliveryProvider,
  DeliveryType,
  FulfillmentType,
  PaymentMethod,
} from '@prisma/client';
import type { OrderStatus } from '../order-status';
import type { Prisma } from '@prisma/client';

export type OrderItemDto = {
  productStableId: string;
  qty: number;
  displayName: string;
  nameEn: string | null;
  nameZh: string | null;
  unitPriceCents: number;
  optionsJson?: Prisma.InputJsonValue;
};

export type OrderDto = {
  // ✅ 对外唯一标识：stableId（不返回内部 UUID）
  orderStableId: string;

  // ✅ 展示用单号：优先 clientRequestId，保底 orderStableId
  orderNumber: string;

  // ✅ 展示/打印用单号（可能为空）
  clientRequestId: string | null;

  status: OrderStatus;
  channel: Channel;
  fulfillmentType: FulfillmentType;

  paymentMethod: PaymentMethod | null;

  pickupCode: string | null;

  contactName: string | null;
  contactPhone: string | null;

  deliveryType: DeliveryType | null;
  deliveryProvider: DeliveryProvider | null;
  deliveryEtaMinMinutes: number | null;
  deliveryEtaMaxMinutes: number | null;

  subtotalCents: number;
  taxCents: number;
  deliveryFeeCents: number;
  totalCents: number;

  couponCodeSnapshot: string | null;
  couponTitleSnapshot: string | null;
  couponDiscountCents: number;

  loyaltyRedeemCents: number;

  createdAt: string; // ISO
  paidAt: string | null; // ISO

  items: OrderItemDto[];
};
