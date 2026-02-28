import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class CreatePaymentSessionDto {
  @IsObject()
  readonly metadata!: Record<string, unknown>;

  @IsString()
  @IsIn(['APPLE_PAY', 'GOOGLE_PAY', 'CARD'])
  readonly paymentMethod!: 'APPLE_PAY' | 'GOOGLE_PAY' | 'CARD';

  @IsOptional()
  @IsString()
  readonly checkoutIntentId?: string;
}
