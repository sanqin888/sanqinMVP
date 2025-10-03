export type Channel = 'web' | 'in_store' | 'ubereats';
export type Fulfillment = 'pickup' | 'dine_in';

export interface OrderItem {
  productId: string;
  qty: number;
  options?: Record<string, unknown>;
}

export interface Order {
  id: string;
  createdAt: string;
  channel: 'web' | 'in_store' | 'ubereats';
  items: Array<{ productId: string; qty: number }>;
  subtotal: number;
  taxTotal: number;
  total: number;
  fulfillmentType: 'pickup' | 'dine_in';
  pickupCode: string;
  status: 'paid' | 'pending';
}
