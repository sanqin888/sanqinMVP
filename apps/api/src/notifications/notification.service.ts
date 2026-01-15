import { Injectable, Logger } from '@nestjs/common';
import type { User } from '@prisma/client';
import { EmailService } from '../email/email.service';
import { SmsService } from '../sms/sms.service';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

class NotificationRateLimiter {
  private readonly events = new Map<string, number[]>();

  canSend(key: string, windowMs: number, limit: number): boolean {
    const now = Date.now();
    const timestamps = this.events.get(key) ?? [];
    const filtered = timestamps.filter((ts) => now - ts < windowMs);
    if (filtered.length >= limit) {
      this.events.set(key, filtered);
      return false;
    }
    filtered.push(now);
    this.events.set(key, filtered);
    return true;
  }
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly marketingLimiter = new NotificationRateLimiter();

  constructor(
    private readonly emailService: EmailService,
    private readonly smsService: SmsService,
  ) {}

  async notifyOrderReady(params: {
    phone: string;
    orderNumber: string;
    name?: string | null;
  }) {
    const greeting = params.name ? `Hi ${params.name},` : 'Hi,';
    const body = `${greeting} your order ${params.orderNumber} is ready for pickup.`;
    return this.smsService.sendSms({
      phone: params.phone,
      body,
    });
  }

  async notifyCouponIssued(params: {
    user: User;
    programName: string;
    couponCount: number;
    expiresAt?: Date | null;
  }) {
    if (!params.user.email || !params.user.marketingEmailOptIn) {
      return { ok: false, error: 'marketing opt-in missing' };
    }

    const canSend = this.marketingLimiter.canSend(
      `coupon:${params.user.id}`,
      WEEK_MS,
      3,
    );

    if (!canSend) {
      this.logger.warn(`Coupon email suppressed for user ${params.user.id}`);
      return { ok: false, error: 'rate_limited' };
    }

    return this.emailService.sendCouponIssuedEmail({
      to: params.user.email,
      name: params.user.name,
      programName: params.programName,
      couponCount: params.couponCount,
      expiresAt: params.expiresAt,
      locale: params.user.language === 'ZH' ? 'zh' : 'en',
    });
  }

  async notifyMarketing(params: {
    user: User;
    subject: string;
    html?: string;
    text?: string;
  }) {
    if (!params.user.email || !params.user.marketingEmailOptIn) {
      return { ok: false, error: 'marketing opt-in missing' };
    }

    const canSend = this.marketingLimiter.canSend(
      `marketing:${params.user.id}`,
      WEEK_MS,
      1,
    );
    if (!canSend) {
      this.logger.warn(`Marketing email suppressed for user ${params.user.id}`);
      return { ok: false, error: 'rate_limited' };
    }

    return this.emailService.sendEmail({
      to: params.user.email,
      subject: params.subject,
      html: params.html,
      text: params.text,
      tags: { type: 'marketing' },
    });
  }

  async notifyPointsReminder(params: {
    user: User;
    subject: string;
    html?: string;
    text?: string;
  }) {
    if (!params.user.email || !params.user.marketingEmailOptIn) {
      return { ok: false, error: 'marketing opt-in missing' };
    }

    const canSend = this.marketingLimiter.canSend(
      `points:${params.user.id}`,
      MONTH_MS,
      2,
    );
    if (!canSend) {
      this.logger.warn(`Points reminder suppressed for user ${params.user.id}`);
      return { ok: false, error: 'rate_limited' };
    }

    return this.emailService.sendEmail({
      to: params.user.email,
      subject: params.subject,
      html: params.html,
      text: params.text,
      tags: { type: 'points_reminder' },
    });
  }
}
