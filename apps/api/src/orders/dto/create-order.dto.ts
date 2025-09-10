export type Channel = 'web' | 'in_store' | 'ubereats';
export type Fulfillment = 'pickup' | 'dine_in';

export class CreateOrderDto {
  userId?: string;
  channel!: Channel;
  items!: { productId: string; qty: number; options?: Record<string, any> }[];
  subtotal!: number;      // 不含税
  taxTotal!: number;      // 税额
  total!: number;         // 含税总额
  fulfillmentType!: Fulfillment;
}
