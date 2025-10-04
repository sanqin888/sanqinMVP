<<<<<<< HEAD
export type Channel = 'web' | 'in_store' | 'ubereats';
export type FulfillmentType = 'pickup' | 'dine_in';

export interface CreateOrderItemInput {
  productId: string;
  qty: number;
  /** 单价（元）可选；如传入则后端换算为 cents */
  unitPrice?: number;
  /** 规格/加料等自由结构 */
=======
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  IsObject,
} from 'class-validator';

export type Channel = 'web' | 'in_store' | 'ubereats';
export type FulfillmentType = 'pickup' | 'dine_in';

export class OrderItemDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(1)
  qty!: number;

  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  @IsOptional()
  @IsObject()
  // 仅用于透传到 JSONB；不返回 any
>>>>>>> 250f2f74e2ebb2f9e63ec055a026622d0191ba54
  options?: Record<string, unknown>;
}

export class CreateOrderDto {
<<<<<<< HEAD
  channel!: Channel;
  fulfillmentType!: FulfillmentType;
  items!: CreateOrderItemInput[];
  /** 小计（元） */
  subtotal!: number;
  /** 税额（元） */
  taxTotal!: number;
  /** 合计（元） */
  total!: number;
=======
  @IsEnum(['web', 'in_store', 'ubereats'])
  channel!: Channel;

  @IsEnum(['pickup', 'dine_in'])
  fulfillmentType!: FulfillmentType;

  @IsNumber()
  subtotal!: number;

  @IsNumber()
  taxTotal!: number;

  @IsNumber()
  total!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
>>>>>>> 250f2f74e2ebb2f9e63ec055a026622d0191ba54
}
