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
  options?: Record<string, unknown>;
}

export class CreateOrderDto {
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
}
