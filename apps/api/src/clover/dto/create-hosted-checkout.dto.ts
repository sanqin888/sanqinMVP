import { IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class CreateHostedCheckoutDto {
  @IsInt()
  @Min(1)
  readonly amountCents!: number;

  @IsOptional()
  @IsString()
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
