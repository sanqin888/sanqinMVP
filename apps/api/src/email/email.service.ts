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

  private resolveLocale(locale?: string): 'zh' | 'en' {
    const normalized = locale?.toLowerCase() ?? '';
    return normalized.startsWith('zh') ? 'zh' : 'en';
  }

  async sendVerificationEmail(params: {
    to: string;
    token: string;
    name?: string | null;
    locale?: string;
  }) {
    const verifyUrl = `${this.baseUrl}/verify-email?token=${params.token}`;
    const resolvedLocale = this.resolveLocale(params.locale);
    const greeting =
      resolvedLocale === 'zh'
        ? params.name
          ? `您好，${params.name}：`
          : '您好：'
        : params.name
          ? `Hi ${params.name},`
          : 'Hi,';
    const subject =
      resolvedLocale === 'zh' ? '验证您的邮箱' : 'Verify your email';
    const text =
      resolvedLocale === 'zh'
        ? `${greeting}\n\n请点击以下链接验证邮箱：${verifyUrl}\n\n链接有效期为 24 小时。`
        : `${greeting}\n\nPlease verify your email by visiting: ${verifyUrl}\n\nThis link expires in 24 hours.`;
    const html =
      resolvedLocale === 'zh'
        ? `
      <p>${greeting}</p>
      <p>请点击以下链接验证邮箱：</p>
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p>链接有效期为 24 小时。</p>
    `
        : `
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
    locale?: string;
  }) {
    const resolvedLocale = this.resolveLocale(params.locale);
    const greeting =
      resolvedLocale === 'zh'
        ? params.name
          ? `您好，${params.name}：`
          : '您好：'
        : params.name
          ? `Hi ${params.name},`
          : 'Hi,';
    const expiresLine =
      params.expiresAt && resolvedLocale === 'zh'
        ? `\n有效期至：${params.expiresAt.toDateString()}`
        : params.expiresAt
          ? `\nExpires on: ${params.expiresAt.toDateString()}`
          : '';
    const subject =
      resolvedLocale === 'zh'
        ? `${params.programName} 优惠券已发送`
        : `Your ${params.programName} coupon${params.couponCount > 1 ? 's' : ''} are here`;
    const text =
      resolvedLocale === 'zh'
        ? `${greeting}\n\n我们已向您的账户发放 ${params.couponCount} 张 ${params.programName} 优惠券。${expiresLine}`
        : `${greeting}\n\nWe just added ${params.couponCount} coupon${
            params.couponCount > 1 ? 's' : ''
          } to your account for ${params.programName}.${expiresLine}`;
    const html =
      resolvedLocale === 'zh'
        ? `
      <p>${greeting}</p>
      <p>我们已向您的账户发放 <strong>${params.couponCount}</strong> 张 ${params.programName} 优惠券。</p>
      ${
        params.expiresAt
          ? `<p>有效期至：${params.expiresAt.toDateString()}</p>`
          : ''
      }
    `
        : `
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
    locale?: string;
  }) {
    const inviteUrl = `${this.baseUrl}/admin/accept-invite?token=${encodeURIComponent(params.token)}`;
    const resolvedLocale = this.resolveLocale(params.locale);
    if (resolvedLocale === 'zh') {
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

    const subject = 'You are invited to join the Sanqin team';
    const roleName = params.role === 'ADMIN' ? 'Admin' : 'Staff';
    const inviterLine = params.inviterName ?? 'an admin';
    const text = `Hello,\n\n${inviterLine} invited you to join the admin dashboard as ${roleName}.\nPlease click the link below to set your password and activate your account:\n${inviteUrl}\n\nThis link expires in 7 days. If you did not expect this invitation, you can ignore this email.`;
    const html = `
      <p>Hello,</p>
      <p>${inviterLine} invited you to join the admin dashboard as <strong>${roleName}</strong>.</p>
      <p>Please click the link below to set your password and activate your account:</p>
      <p><a href="${inviteUrl}">${inviteUrl}</a></p>
      <p>This link expires in 7 days. If you did not expect this invitation, you can ignore this email.</p>
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
