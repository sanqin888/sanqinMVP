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

class CreateOrderItemDto {
  @IsString() productId!: string;
  @IsInt() @Min(1) qty!: number;

  // 可选：单价、加料
  @IsOptional() unitPrice?: number;
  @IsOptional() options?: Record<string, unknown>;
}

export class CreateOrderDto {
  @IsOptional() @IsString() userId?: string;

  @IsIn(['web', 'in_store', 'ubereats'])
  channel!: 'web' | 'in_store' | 'ubereats';

  @IsIn(['pickup', 'dine_in'])
  fulfillmentType!: 'pickup' | 'dine_in';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  /** 本单打算使用的积分（整数“点”），可选 */
  @IsOptional()
  @IsInt()
  @Min(0)
  pointsToRedeem?: number;

  /** 仍然保留前端传入口径，但金额实际以后端为准 */
  @IsInt() @Min(0) subtotal!: number;
  @IsInt() @Min(0) taxTotal!: number;
  @IsInt() @Min(0) total!: number;
}
