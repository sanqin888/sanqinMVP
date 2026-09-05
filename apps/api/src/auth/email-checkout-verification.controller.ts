import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

import {
  IDENTITY_EMAIL_VERIFICATION,
  type IdentityEmailVerificationPort,
} from './email-verification.port';

class SendCheckoutEmailCodeDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsIn(['checkout'])
  purpose?: 'checkout';
}

class VerifyCheckoutEmailCodeDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsOptional()
  @IsIn(['checkout'])
  purpose?: 'checkout';
}

@Controller('email/checkout')
export class EmailCheckoutVerificationController {
  constructor(
    @Inject(IDENTITY_EMAIL_VERIFICATION)
    private readonly service: IdentityEmailVerificationPort,
  ) {}

  @Post('send-code')
  async sendCode(@Body() body: SendCheckoutEmailCodeDto, @Req() req: Request) {
    const result = await this.service.requestCheckoutVerification({
      email: body.email,
      locale: body.locale,
      purpose: body.purpose ?? 'checkout',
      ip: req.ip,
    });

    if (!result.ok) {
      throw new BadRequestException(result.error ?? 'email_send_failed');
    }

    return result;
  }

  @Post('verify-code')
  async verifyCode(@Body() body: VerifyCheckoutEmailCodeDto) {
    const result = await this.service.verifyCheckoutToken({
      email: body.email,
      token: body.code,
      purpose: body.purpose ?? 'checkout',
    });

    if (!result.ok) {
      throw new BadRequestException(result.error ?? 'token_invalid');
    }

    return result;
  }
}
