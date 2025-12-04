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
} from 'class-validator';
import { Channel, DeliveryType, FulfillmentType } from '@prisma/client';

class CreateOrderItemDto {
  @IsString() productId!: string;
  @IsInt() @Min(1) qty!: number;

  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsString() nameZh?: string;

  // 可选：单价、加料
  @IsOptional() unitPrice?: number;
  @IsOptional() options?: Record<string, unknown>;
}

export class DeliveryDestinationDto {
  @IsString()
  name!: string;

  @IsString()
  phone!: string;

  @IsString()
  addressLine1!: string;

  @IsOptional()
  @IsString()
  addressLine2?: string;

  @IsString()
  city!: string;

  @IsString()
  province!: string;

  @IsString()
  postalCode!: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  tipCents?: number;
}

export class CreateOrderDto {
  // ✅ 允许任意字符串 userId（例如 "google:xxxxx"），只保证是字符串就行
  @IsOptional()
  @IsString()
  userId?: string;

  // ✅ 允许任意字符串 clientRequestId（SQ****** 等）
  @IsOptional()
  @IsString()
  clientRequestId?: string;

  @IsOptional()
  @IsString()
  pickupCode?: string;

  // ✅ 用 Prisma 的 Channel enum，保证和 schema 统一
  @IsEnum(Channel)
  channel!: Channel;

  @IsEnum(FulfillmentType)
  fulfillmentType!: FulfillmentType;

  @IsOptional()
  @IsEnum(DeliveryType)
  deliveryType?: DeliveryType;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items?: CreateOrderItemDto[];

  /** 本单打算使用的积分（整数“点”），可选 */
  @IsOptional()
  @IsInt()
  @Min(0)
  pointsToRedeem?: number;

  /** （保留给内部特殊场景，例如纯积分订单）抵扣金额（单位：分） */
  @IsOptional()
  @IsInt()
  @Min(0)
  redeemValueCents?: number;

  @IsOptional() @IsInt() @Min(0) subtotalCents?: number;
  @IsOptional() @IsInt() @Min(0) taxCents?: number;
  @IsOptional() @IsInt() @Min(0) totalCents?: number;
  @IsOptional() @IsInt() @Min(0) deliveryFeeCents?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryDestinationDto)
  deliveryDestination?: DeliveryDestinationDto;
}
