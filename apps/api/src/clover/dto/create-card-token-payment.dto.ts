import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
export const CLOVER_PAYMENT_CURRENCY = 'CAD' as const;

export class CreateCardTokenPaymentDto {
  @IsInt()
  @Min(1)
  readonly amountCents!: number;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : undefined,
  )
  @IsString()
  @IsIn([CLOVER_PAYMENT_CURRENCY])
  readonly currency?: string;

  @IsString()
  @IsNotEmpty()
  readonly source!: string;

  @IsString()
  @IsIn(['CARD'])
  readonly sourceType!: 'CARD';

  @IsString()
  readonly cardholderName!: string;

  @IsOptional()
  @IsString()
  readonly postalCode?: string;

  @IsObject()
  readonly customer!: Record<string, unknown>;

  @IsObject()
  readonly threeds!: Record<string, unknown>;


  @IsString()
  @IsNotEmpty()
  readonly pricingToken!: string;

  @IsObject()
  readonly metadata!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  readonly checkoutIntentId?: string;
}
