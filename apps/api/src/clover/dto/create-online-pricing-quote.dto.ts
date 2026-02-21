import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateOnlinePricingQuoteDto {
  @IsObject()
  readonly metadata!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  readonly checkoutIntentId?: string;
}
