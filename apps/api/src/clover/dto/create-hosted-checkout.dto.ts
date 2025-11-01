import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export const HOSTED_CHECKOUT_CURRENCY = 'CAD' as const;

export class CreateHostedCheckoutDto {
  @IsInt()
  @Min(1)
  readonly amountCents!: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsString()
  @IsIn([HOSTED_CHECKOUT_CURRENCY])
  readonly currency?: string;

  @IsOptional()
  @IsString()
  readonly referenceId?: string;

  @IsOptional()
  @IsString()
  readonly description?: string;

  @IsOptional()
  @IsString()
  readonly returnUrl?: string;

  @IsOptional()
  @IsString()
  readonly cancelUrl?: string;

  @IsOptional()
  @IsObject()
  readonly metadata?: Record<string, unknown>;
}
