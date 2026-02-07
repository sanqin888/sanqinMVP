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
import { HOSTED_CHECKOUT_CURRENCY } from './create-hosted-checkout.dto';

export class CreateCardTokenPaymentDto {
  @IsInt()
  @Min(1)
  readonly amountCents!: number;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : undefined,
  )
  @IsString()
  @IsIn([HOSTED_CHECKOUT_CURRENCY])
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

  @IsObject()
  readonly metadata!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  readonly checkoutIntentId?: string;
}
