// apps/api/src/phone-verification/phone-verification.controller.ts
import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
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
    const { phone, locale, purpose } = body;
    const result = await this.service.sendCode({ phone, locale, purpose });
    // 统一返回 { ok, error? }
    return result;
  }

  /**
   * POST /api/v1/auth/phone/verify-code
   */
  @Post('verify-code')
  async verifyCode(@Body() body: VerifyCodeDto): Promise<VerifyCodeResult> {
    const { phone, code, purpose, userId } = body as VerifyCodeDto & {
      userId?: string;
    };
    if (userId) {
      throw new BadRequestException('userId is not allowed');
    }
    const result = await this.service.verifyCode({ phone, code, purpose });
    return result;
  }
}
