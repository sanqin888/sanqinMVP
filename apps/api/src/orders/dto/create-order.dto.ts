// apps/api/src/orders/dto/create-order.dto.ts
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
import {
  Channel,
  DeliveryType,
  FulfillmentType,
  PaymentMethod,
} from '@prisma/client';

class CreateOrderItemDto {
  // ✅ 对外统一：引用菜品 stableId
  @IsString()
  productStableId!: string;

  @IsInt()
  @Min(1)
  qty!: number;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  nameEn?: string;

  @IsOptional()
  @IsString()
  nameZh?: string;

  // 可选：单价、加料
  @IsOptional()
  unitPrice?: number;

  @IsOptional()
  options?: Record<string, unknown>;
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
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  orderStableId?: string;

  /**
   * @deprecated use orderStableId instead
   */
  @IsOptional()
  @IsString()
  clientRequestId?: string;

  @IsOptional()
  @IsString()
  pickupCode?: string;

  // === 订单级联系方式（账号手机号分离） ===
  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsEnum(Channel)
  channel!: Channel;

  @IsEnum(FulfillmentType)
  fulfillmentType!: FulfillmentType;

  /**
   * ✅ 新增：支付方式（POS 侧必须传；Web 可不传，后端会推断为 CARD）
   * - CASH
   * - CARD
   * - WECHAT_ALIPAY
   */
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

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

  @IsOptional()
  @IsInt()
  @Min(0)
  subtotalCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  taxCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  totalCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  deliveryFeeCents?: number;

  @IsOptional()
  @IsString()
  couponId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryDestinationDto)
  deliveryDestination?: DeliveryDestinationDto;
}
