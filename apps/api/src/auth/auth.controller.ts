// apps/api/src/auth/auth.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SendCodeDto } from '../phone-verification/dto/send-code.dto';
import { VerifyCodeDto } from '../phone-verification/dto/verify-code.dto';
import type { Request } from 'express';

interface RequestWithUser extends Request {
  user?: { id?: string | null; userId?: string | null } | null;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  /**
   * 申请发送验证码
   * POST /api/v1/auth/phone/request-code
   */
  @Post('phone/request-code')
  async requestCode(@Body() dto: SendCodeDto & { purpose?: string }) {
    const { phone, locale, purpose } = dto;

    if (!phone) {
      throw new BadRequestException('phone is required');
    }

    const result = await this.authService.requestPhoneCode({
      phone,
      // 不传就默认 checkout，将来想按用途区分可以自己传
      purpose: purpose ?? 'checkout',
    });

    this.logger.log(
      `requestCode: phone=${phone}, locale=${locale ?? 'n/a'}, purpose=${
        purpose ?? 'checkout'
      }`,
    );

    return result;
  }

  /**
   * 校验验证码 +（可选）绑定会员手机号
   * POST /api/v1/auth/phone/verify-code
   */
  @Post('phone/verify-code')
  async verifyCode(
    @Req() req: RequestWithUser,
    @Body() dto: VerifyCodeDto & { purpose?: string; userId?: string },
  ) {
    const { phone, code, purpose, userId: userIdFromBody } = dto;

    if (!phone || !code) {
      throw new BadRequestException('phone and code are required');
    }

    // 如果请求是带登录态的（以后你给这个接口加 AuthGuard），也可以从 req.user 取
    const userIdFromReq = req.user?.id ?? req.user?.userId ?? undefined;
    const userId = userIdFromBody ?? userIdFromReq ?? undefined;

    return this.authService.verifyPhoneCode({
      phone,
      code,
      purpose,
      userId, // ✅ 有 userId 时，就会在 AuthService 里 attachPhoneToUser
    });
  }
}
