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

  async sendStaffInviteEmail(params: {
    to: string;
    token: string;
    role: string;
    inviterName?: string | null;
  }) {
    const inviteUrl = `${this.baseUrl}/admin/accept-invite?token=${encodeURIComponent(params.token)}`;
    const subject = '邀请您加入 Sanqin 团队';
    const roleName = params.role === 'ADMIN' ? '管理员' : '普通员工';
    const inviterLine = params.inviterName ?? '管理员';
    const text = `您好，\n\n${inviterLine} 邀请您以 ${roleName} 身份加入管理后台。\n请点击以下链接设置密码并激活账号：\n${inviteUrl}\n\n此链接有效期为 7 天。如果这不是您预期的操作，请忽略此邮件。`;
    const html = `
      <p>您好，</p>
      <p>${inviterLine} 邀请您以 <strong>${roleName}</strong> 身份加入管理后台。</p>
      <p>请点击下方链接设置您的登录密码并激活账号：</p>
      <p><a href="${inviteUrl}">${inviteUrl}</a></p>
      <p>此链接有效期为 7 天。如果这不是您预期的操作，请忽略此邮件。</p>
    `;

    return this.sendEmail({
      to: params.to,
      subject,
      text,
      html,
      tags: { type: 'staff_invite' },
    });
  }
}
