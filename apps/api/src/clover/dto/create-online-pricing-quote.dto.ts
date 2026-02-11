import { IsObject } from 'class-validator';

export class CreateOnlinePricingQuoteDto {
  @IsObject()
  readonly metadata!: Record<string, unknown>;
}
