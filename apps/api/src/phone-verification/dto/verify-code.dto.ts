// apps/api/src/phone-verification/dto/verify-code.dto.ts
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { PhoneOtpPurpose } from './send-code.dto';

export class VerifyCodeDto {
  @IsString()
  @IsNotEmpty()
  phone!: string; // 必填：手机号

  @IsString()
  @IsNotEmpty()
  code!: string; // 必填：短信验证码

  @IsOptional()
  @IsIn(['checkout', 'membership-login', 'membership-bind'])
  purpose?: PhoneOtpPurpose; // 可选：用途
}
