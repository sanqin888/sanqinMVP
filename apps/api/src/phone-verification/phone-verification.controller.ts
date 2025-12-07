// apps/api/src/phone-verification/phone-verification.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import {
  PhoneVerificationService,
  VerifyCodeResult,
} from './phone-verification.service';
import { SendCodeDto } from './dto/send-code.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';

@Controller('auth/phone')
export class PhoneVerificationController {
  constructor(private readonly service: PhoneVerificationService) {}

  /**
   * POST /api/v1/auth/phone/send-code
   */
  @Post('send-code')
  async sendCode(@Body() body: SendCodeDto) {
    const { phone, locale } = body;
    const result = await this.service.sendCode({ phone, locale });
    // 统一返回 { ok, error? }
    return result;
  }

  /**
   * POST /api/v1/auth/phone/verify-code
   */
  @Post('verify-code')
  async verifyCode(@Body() body: VerifyCodeDto): Promise<VerifyCodeResult> {
    const { phone, code } = body;
    const result = await this.service.verifyCode({ phone, code });
    return result;
  }
}
