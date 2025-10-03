export type Channel = 'web' | 'in_store' | 'ubereats';
export type FulfillmentType = 'pickup' | 'dine_in';

export interface CreateOrderItemInput {
  productId: string;
  qty: number;
  /** 单价（元）；如传则服务端换算为 cents */
  unitPrice?: number;
  /** 规格/加料等自由结构 */
  options?: Record<string, unknown>;
}

export class CreateOrderDto {
  channel!: Channel;
  fulfillmentType!: FulfillmentType;
  items!: CreateOrderItemInput[];
  /** 小计（元） */ subtotal!: number;
  /** 税额（元） */ taxTotal!: number;
  /** 合计（元） */ total!: number;
}
