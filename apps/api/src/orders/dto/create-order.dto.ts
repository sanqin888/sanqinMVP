import {
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export enum OrderChannel {
  WEB = 'web',
  IN_STORE = 'in_store',
  UBEREATS = 'ubereats',
}

export enum FulfillmentType {
  PICKUP = 'pickup',
  DINE_IN = 'dine_in',
}

export class OrderItemInput {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(1)
  qty!: number;

  // 价格以服务端/商品库为准；允许前端不传或仅作参考
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsNumber({}, { message: 'unitPrice 需要是数字（可选）' })
  unitPrice?: number;

  // 选项自由结构：例如 { 辣度: "中辣", 加料: ["加肉"] }
  @IsOptional()
  @IsObject()
  options?: Record<string, any>;
}

export class CreateOrderDto {
  @IsEnum(OrderChannel)
  channel!: OrderChannel;

  @IsEnum(FulfillmentType)
  fulfillmentType!: FulfillmentType;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemInput)
  items!: OrderItemInput[];

  // 允许前端以字符串传入，统一转 number（分开传小计/税额/总额）
  @Transform(({ value }) => (value === '' ? 0 : typeof value === 'string' ? Number(value) : value))
  @IsNumber()
  subtotal!: number;

  @Transform(({ value }) => (value === '' ? 0 : typeof value === 'string' ? Number(value) : value))
  @IsNumber()
  taxTotal!: number;

  @Transform(({ value }) => (value === '' ? 0 : typeof value === 'string' ? Number(value) : value))
  @IsNumber()
  total!: number;

  // 可选信息（不影响当前下单流程）
  @IsOptional()
  @IsISO8601()
  pickupTime?: string; // ISO 时间字符串

  @IsOptional()
  @IsObject()
  contact?: { name?: string; phone?: string };

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  pointsToRedeem?: number;
}
