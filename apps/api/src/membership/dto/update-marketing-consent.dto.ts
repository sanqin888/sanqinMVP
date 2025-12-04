// apps/api/src/membership/dto/update-marketing-consent.dto.ts
import { IsBoolean, IsString } from 'class-validator';

export class UpdateMarketingConsentDto {
  @IsString()
  userId!: string;

  @IsBoolean()
  marketingEmailOptIn!: boolean;
}
