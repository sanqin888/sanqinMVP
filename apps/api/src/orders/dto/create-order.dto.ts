export type Channel = 'web' | 'in_store' | 'ubereats';
export type Fulfillment = 'pickup' | 'dine_in';

export class CreateOrderDto {
  userId?: string;
  channel!: 'web' | 'in_store' | 'ubereats';
  items!: { productId: string; qty: number; options?: Record<string, unknown> }[]; // ← 这里
  subtotal!: number;   // 不含税
  taxTotal!: number;   // 税额
  total!: number;      // 含税总额
  fulfillmentType!: 'pickup' | 'dine_in';
}
