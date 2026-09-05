import { Injectable } from '@nestjs/common';
import { MessagingTemplateType } from '@prisma/client';

import { EmailService } from '../email/email.service';
import { SmsService } from '../sms/sms.service';
import { BusinessConfigService } from './business-config.service';
import type {
  AuthChallengeDeliveryPort,
  AuthChallengeDeliveryResult,
  LoginTwoFactorEmailDeliveryInput,
  LoginTwoFactorSmsDeliveryInput,
  MembershipLoginSmsDeliveryInput,
  PhoneEnrollmentSmsDeliveryInput,
} from './contracts/auth-challenge-delivery.contract';
import { TemplateRenderer } from './template-renderer';

@Injectable()
export class AuthChallengeDeliveryService implements AuthChallengeDeliveryPort {
  constructor(
    private readonly emailService: EmailService,
    private readonly smsService: SmsService,
    private readonly templateRenderer: TemplateRenderer,
    private readonly businessConfigService: BusinessConfigService,
  ) {}

  async sendLoginTwoFactorSms(
    input: LoginTwoFactorSmsDeliveryInput,
  ): Promise<AuthChallengeDeliveryResult> {
    const message = await this.renderOtpSms({
      code: input.code,
      expiresInMin: input.expiresInMin,
      locale: input.locale,
      purpose: 'login_2fa',
    });
    const result = await this.smsService.sendSms({
      phone: input.phone,
      body: message,
      templateType: MessagingTemplateType.OTP,
      locale: input.locale,
      userStableId: input.userStableId,
      metadata: { purpose: 'login_2fa' },
    });
    return { ok: result.ok, sendId: result.sendId, error: result.error };
  }

  async sendLoginTwoFactorEmail(
    input: LoginTwoFactorEmailDeliveryInput,
  ): Promise<AuthChallengeDeliveryResult> {
    const { subject, html, text } = await this.renderOtpEmail({
      code: input.code,
      expiresInMin: input.expiresInMin,
      locale: input.locale,
      purpose: 'admin_login',
    });
    const result = await this.emailService.sendEmail({
      to: input.email,
      subject,
      text,
      html,
      tags: { type: 'admin_login_2fa' },
      locale: input.locale,
      templateType: MessagingTemplateType.OTP,
      userStableId: input.userStableId,
      metadata: { purpose: 'admin_login' },
    });
    return { ok: result.ok, sendId: result.sendId, error: result.error };
  }

  async sendPhoneEnrollmentSms(
    input: PhoneEnrollmentSmsDeliveryInput,
  ): Promise<AuthChallengeDeliveryResult> {
    const message = await this.renderOtpSms({
      code: input.code,
      expiresInMin: input.expiresInMin,
      locale: input.locale,
      purpose: 'verify',
    });
    const result = await this.smsService.sendSms({
      phone: input.phone,
      body: message,
      templateType: MessagingTemplateType.OTP,
      locale: input.locale,
      userStableId: input.userStableId,
      metadata: { purpose: 'verify' },
    });
    return { ok: result.ok, sendId: result.sendId, error: result.error };
  }

  async sendMembershipLoginSms(
    input: MembershipLoginSmsDeliveryInput,
  ): Promise<AuthChallengeDeliveryResult> {
    const message = await this.renderOtpSms({
      code: input.code,
      expiresInMin: input.expiresInMin,
      locale: input.locale,
      purpose: 'login',
    });
    const result = await this.smsService.sendSms({
      phone: input.phone,
      body: message,
      templateType: MessagingTemplateType.OTP,
      locale: input.locale,
      metadata: { purpose: 'login' },
    });
    return { ok: result.ok, sendId: result.sendId, error: result.error };
  }

  private async renderOtpSms(input: {
    code: string;
    expiresInMin: number;
    locale?: string;
    purpose: string;
  }): Promise<string> {
    const { baseVars } = await this.businessConfigService.getMessagingSnapshot(
      input.locale,
    );
    return this.templateRenderer.renderSms({
      template: 'otp',
      locale: input.locale,
      vars: {
        ...baseVars,
        code: input.code,
        expiresInMin: input.expiresInMin,
        purpose: input.purpose,
      },
    });
  }

  private async renderOtpEmail(input: {
    code: string;
    expiresInMin: number;
    locale?: string;
    purpose: string;
  }): Promise<{ subject: string; html: string; text: string }> {
    const { baseVars } = await this.businessConfigService.getMessagingSnapshot(
      input.locale,
    );
    return this.templateRenderer.renderEmail({
      template: 'otp',
      locale: input.locale,
      vars: {
        ...baseVars,
        code: input.code,
        expiresInMin: input.expiresInMin,
        purpose: input.purpose,
      },
    });
  }
}
