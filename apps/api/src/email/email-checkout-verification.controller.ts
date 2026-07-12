import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { EmailVerificationService } from './email-verification.service';

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
  constructor(private readonly service: EmailVerificationService) {}

  @Post('send-code')
  async sendCode(@Body() body: SendCheckoutEmailCodeDto) {
    const result = await this.service.requestCheckoutVerification({
      email: body.email,
      locale: body.locale,
      purpose: body.purpose ?? 'checkout',
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
