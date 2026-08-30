//apps/api/src/orders/dto/order.dto.ts
import type { OrderStatus } from '../order-status';
import type {
  Channel,
  DeliveryProvider,
  DeliveryType,
  FulfillmentType,
  OrderDiscountDisplayEntry,
  OrderJsonValue,
  PaymentMethod,
} from '@shared/order';
import type { OrderItemComponentDisplaySnapshot } from '../order-item-components';
import type { OrderItemOptionsSnapshot } from '../order-item-options';

export type OrderItemDto = {
  productStableId: string;
  qty: number;
  displayName: string;
  nameEn: string | null;
  nameZh: string | null;
  unitPriceCents: number;
  specialInstructions: string | null;
  optionsJson?: OrderJsonValue;
  componentsJson?: OrderJsonValue;
  displayOptions?: OrderItemOptionsSnapshot | null;
  components?: OrderItemComponentDisplaySnapshot[];
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

  /** External-channel order note relayed for POS display (for example Uber requests). */
  orderNotes?: string | null;

  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;

  deliveryType: DeliveryType | null;
  deliveryProvider: DeliveryProvider | null;
  deliveryEtaMinMinutes: number | null;
  deliveryEtaMaxMinutes: number | null;

  subtotalCents: number;
  displaySubtotalCents: number;
  appliedDiscounts: OrderDiscountDisplayEntry[];
  subtotalAfterDiscountCents: number;
  taxCents: number;
  deliveryFeeCents: number;
  deliveryCostCents: number | null; // 白标实际成本（没有就 null/0，按你偏好）
  deliverySubsidyCents: number | null; //补贴金额
  totalCents: number;
  paymentTotalCents: number;
  creditCardSurchargeCents: number;
  externalPaidCents?: number;

  couponCodeSnapshot: string | null;
  couponTitleSnapshot: string | null;
  couponDiscountCents: number;

  loyaltyRedeemCents: number;

  balancePaidCents?: number;
  pointsEarned?: number;

  createdAt: string; // ISO
  paidAt: string | null; // ISO

  items: OrderItemDto[];
};
