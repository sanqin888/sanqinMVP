import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EmailProvider } from './email.provider';
import { EMAIL_PROVIDER_TOKEN } from './email.tokens';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly fromName = process.env.EMAIL_FROM_NAME ?? 'Sanq';
  private readonly baseUrl = process.env.PUBLIC_BASE_URL ?? 'https://sanq.ca';

  constructor(
    @Inject(EMAIL_PROVIDER_TOKEN) private readonly provider: EmailProvider,
  ) {}

  async sendEmail(params: {
    to: string;
    subject: string;
    html?: string;
    text?: string;
    tags?: Record<string, string>;
  }) {
    const result = await this.provider.sendEmail(params);
    if (!result.ok) {
      this.logger.warn(`Email send failed: ${result.error ?? 'unknown'}`);
    }
    return result;
  }

  async sendVerificationEmail(params: {
    to: string;
    token: string;
    name?: string | null;
  }) {
    const verifyUrl = `${this.baseUrl}/verify-email?token=${params.token}`;
    const subject = 'Verify your email';
    const greeting = params.name ? `Hi ${params.name},` : 'Hi,';
    const text = `${greeting}\n\nPlease verify your email by visiting: ${verifyUrl}\n\nThis link expires in 24 hours.`;
    const html = `
      <p>${greeting}</p>
      <p>Please verify your email by clicking the link below:</p>
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p>This link expires in 24 hours.</p>
    `;

    return this.sendEmail({
      to: params.to,
      subject,
      text,
      html,
      tags: { type: 'email_verification' },
    });
  }

  async sendCouponIssuedEmail(params: {
    to: string;
    name?: string | null;
    programName: string;
    couponCount: number;
    expiresAt?: Date | null;
  }) {
    const greeting = params.name ? `Hi ${params.name},` : 'Hi,';
    const expiresLine = params.expiresAt
      ? `\nExpires on: ${params.expiresAt.toDateString()}`
      : '';
    const subject = `Your ${params.programName} coupon${params.couponCount > 1 ? 's' : ''} are here`;
    const text = `${greeting}\n\nWe just added ${params.couponCount} coupon${
      params.couponCount > 1 ? 's' : ''
    } to your account for ${params.programName}.${expiresLine}`;
    const html = `
      <p>${greeting}</p>
      <p>We just added <strong>${params.couponCount}</strong> coupon${
      params.couponCount > 1 ? 's' : ''
    } to your account for ${params.programName}.</p>
      ${
        params.expiresAt
          ? `<p>Expires on: ${params.expiresAt.toDateString()}</p>`
          : ''
      }
    `;

    return this.sendEmail({
      to: params.to,
      subject,
      text,
      html,
      tags: { type: 'coupon' },
    });
  }
}
