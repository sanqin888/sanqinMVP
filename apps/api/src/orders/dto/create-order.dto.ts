import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsStableId } from '../../common/validators/is-stable-id.validator';

class CreateOrderItemDto {
  @IsString() productId!: string;
  @IsInt() @Min(1) qty!: number;

  // 可选：单价、加料
  @IsOptional() unitPrice?: number;
  @IsOptional() options?: Record<string, unknown>;
}

export class CreateOrderDto {
  @IsOptional()
  @IsStableId({ message: 'userId must be a cuid/uuid when provided' })
  userId?: string;

  @IsOptional()
  @IsStableId({ message: 'clientRequestId must be a cuid/uuid when provided' })
  clientRequestId?: string;

  @IsIn(['web', 'in_store', 'ubereats'])
  channel!: 'web' | 'in_store' | 'ubereats';

  @IsIn(['pickup', 'dine_in'])
  fulfillmentType!: 'pickup' | 'dine_in';

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

  /** 兼容旧版前端传的“抵扣金额（分）” */
  @IsOptional()
  @IsInt()
  @Min(0)
  redeemValueCents?: number;

  /** 仍然保留前端传入口径，但金额实际以后端为准 */
  @IsOptional() @IsInt() @Min(0) subtotal?: number;
  @IsOptional() @IsInt() @Min(0) taxTotal?: number;
  @IsOptional() @IsInt() @Min(0) total?: number;

  /** 兼容旧版接口的“单位：分”字段 */
  @IsOptional() @IsInt() @Min(0) subtotalCents?: number;
  @IsOptional() @IsInt() @Min(0) taxCents?: number;
  @IsOptional() @IsInt() @Min(0) totalCents?: number;
}
