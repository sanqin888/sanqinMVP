// apps/api/src/pos/dto/print-pos-payload.dto.ts
import type { FulfillmentType } from '@prisma/client';
import type { OrderItemOptionsSnapshot } from '../../orders/order-item-options';

type PrintPosPaymentMethod = 'cash' | 'card' | 'wechat_alipay';

type PrintPosItemSnapshot = {
  productStableId: string;
  nameZh: string | null;
  nameEn: string | null;
  displayName: string | null;
  quantity: number;
  lineTotalCents: number;
  options: OrderItemOptionsSnapshot | null;
};

type PrintPosOrderSnapshot = {
  items: PrintPosItemSnapshot[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  deliveryCostCents: number;
  deliverySubsidyCents: number;
};

export type PrintPosPayloadDto = {
  locale: string;
  orderNumber: string;
  pickupCode: string | null;
  fulfillment: FulfillmentType;
  paymentMethod: PrintPosPaymentMethod;
  snapshot: PrintPosOrderSnapshot;
};
