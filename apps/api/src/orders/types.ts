//Users/apple/sanqinMVP/apps/api/src/orders/types.ts
export type Channel = 'web' | 'in_store' | 'ubereats';
export type FulfillmentType = 'pickup' | 'dine_in';
export type DeliveryType = 'STANDARD' | 'PRIORITY';
export type DeliveryProvider = 'DOORDASH_DRIVE' | 'UBER_DIRECT';

import { OrderItemOptionsSnapshot } from './order-item-options';

export interface OrderItem {
  id: string;
  orderId: string;
  productStableId: string;
  qty: number;
  unitPriceCents: number | null;
  optionsJson: OrderItemOptionsSnapshot | null;
}

export interface Order {
  id: string;
  createdAt: string;
  channel: Channel;
  items: OrderItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  fulfillmentType: FulfillmentType;
  pickupCode: string;
  deliveryType: DeliveryType | null;
  deliveryProvider: DeliveryProvider | null;
  deliveryFeeCents: number | null;
  deliveryEtaMinMinutes: number | null;
  deliveryEtaMaxMinutes: number | null;
  externalDeliveryId: string | null;
  status: 'pending' | 'paid' | 'making' | 'ready' | 'completed';
}
