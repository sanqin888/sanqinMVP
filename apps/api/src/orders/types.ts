export type Channel = 'web' | 'in_store' | 'ubereats';
export type FulfillmentType = 'pickup' | 'dine_in';
export const DELIVERY_TYPES = ['STANDARD', 'PRIORITY'] as const;
export type DeliveryType = (typeof DELIVERY_TYPES)[number];

export const DELIVERY_PROVIDERS = ['DOORDASH_DRIVE', 'UBER_DIRECT'] as const;
export type DeliveryProvider = (typeof DELIVERY_PROVIDERS)[number];

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  qty: number;
  unitPriceCents: number | null;
  optionsJson: Record<string, unknown> | null;
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
