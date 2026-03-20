// apps/api/src/pos/dto/print-pos-payload.dto.ts
import type { FulfillmentType } from '@prisma/client';
import type { OrderItemOptionsSnapshot } from '../../orders/order-item-options';

type PrintPosPaymentMethod =
  | 'cash'
  | 'card'
  | 'wechat_alipay'
  | 'store_balance'
  | 'ubereats';

type PrintPosItemSnapshot = {
  productStableId: string;
  nameZh: string | null;
  nameEn: string | null;
  displayName: string | null;
  quantity: number;
  lineTotalCents: number;
  options: OrderItemOptionsSnapshot | null;
};

type PrintPosUtensilsSnapshot = {
  needed: boolean;
  type: string | null;
  quantity: number | null;
  summary: string | null;
};

type PrintPosOrderSnapshot = {
  items: PrintPosItemSnapshot[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  creditCardSurchargeCents: number;
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
  orderNotes: string | null;
  utensils: PrintPosUtensilsSnapshot | null;
  snapshot: PrintPosOrderSnapshot;
};
