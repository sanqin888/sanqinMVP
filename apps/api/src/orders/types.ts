export type Channel = 'web' | 'in_store' | 'ubereats';
export type FulfillmentType = 'pickup' | 'dine_in';

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
  status: 'pending' | 'paid' | 'making' | 'ready' | 'completed';
}
