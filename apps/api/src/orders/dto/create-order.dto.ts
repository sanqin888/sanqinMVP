import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  IsObject,
  IsIn,
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
  options?: Record<string, unknown>;
}

export class CreateOrderDto {
  @IsIn(['web', 'in_store', 'ubereats'])
  channel!: Channel;

  @IsIn(['pickup', 'dine_in'])
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

  @IsOptional()
  @IsString()
  userId?: string;
}
