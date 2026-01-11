// apps/api/src/phone-verification/dto/send-code.dto.ts
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// 将来要扩展新用途，就在这里加一个字符串即可
export type PhoneOtpPurpose =
  | 'checkout'
  | 'membership-login'
  | 'membership-bind'
  | 'pos-recharge';

export class SendCodeDto {
  @IsString()
  @IsNotEmpty()
  phone!: string; // 必填：手机号

  @IsOptional()
  @IsString()
  locale?: string; // 可选：zh/en，方便将来做多语言短信模板

  @IsOptional()
  @IsIn(['checkout', 'membership-login', 'membership-bind', 'pos-recharge'])
  purpose?: PhoneOtpPurpose; // 可选：用途
}
