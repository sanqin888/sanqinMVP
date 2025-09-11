export type Channel = 'web' | 'in_store' | 'ubereats';
export type Fulfillment = 'pickup' | 'dine_in';

export interface OrderItem {
  productId: string;
  qty: number;
  options?: Record<string, unknown>;
}

export interface Order {
  id: string;
  pickupCode: string;
  status: 'paid' | 'pending';
  createdAt: string;            // ISO 字符串
  channel: Channel;
  items: OrderItem[];
  subtotal: number;             // 不含税
  taxTotal: number;             // 税额
  total: number;                // 含税
  fulfillmentType: Fulfillment;
}
