import { Injectable, Logger } from '@nestjs/common';
import { MessagingTemplateType, type CouponProgramTriggerType, type User } from '@prisma/client';
import { EmailService } from '../email/email.service';
import { SmsService } from '../sms/sms.service';
import { BusinessConfigService } from '../messaging/business-config.service';
import { TemplateRenderer } from '../messaging/template-renderer';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

const GIFT_CONTENT_MAP: Record<
  CouponProgramTriggerType,
  {
    zh: { title: string; message: string };
    en: { title: string; message: string };
  }
> = {
  SIGNUP_COMPLETED: {
    zh: {
      title: '欢迎加入我们！',
      message: '感谢您的注册，这是为您准备的新人见面礼：',
    },
    en: {
      title: 'Welcome!',
      message: 'Thanks for signing up! Here is a welcome gift for you:',
    },
  },
  MARKETING_OPT_IN: {
    zh: { title: '订阅成功！', message: '感谢您的订阅，送上一份小心意：' },
    en: {
      title: 'Subscribed!',
      message: 'Thanks for subscribing. Here is a gift for you:',
    },
  },
  REFERRAL_QUALIFIED: {
    zh: {
      title: '邀请奖励到账！',
      message: '感谢您邀请好友，这是您的邀请奖励：',
    },
    en: {
      title: 'Referral Reward!',
      message: 'Thanks for referring a friend. Here is your reward:',
    },
  },
  BIRTHDAY_MONTH: {
    zh: {
      title: '生日快乐！',
      message: '祝您生日快乐！这是为您准备的专属生日礼包：',
    },
    en: {
      title: 'Happy Birthday!',
      message: 'Wishing you a happy birthday! Please enjoy this gift:',
    },
  },
  TIER_UPGRADE: {
    zh: {
      title: '会员升级啦！',
      message: '恭喜您的会员等级提升！这是您的升级奖励：',
    },
    en: {
      title: 'Level Up!',
      message: 'Congratulations on your tier upgrade! Here is your reward:',
    },
  },
};

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
    private readonly templateRenderer: TemplateRenderer,
    private readonly businessConfigService: BusinessConfigService,
  ) {}

  async notifyRegisterWelcome(params: { user: User }) {
    // 准备基础变量
    const locale = params.user.language === 'ZH' ? 'zh' : 'en';
    const { baseVars } =
      await this.businessConfigService.getMessagingSnapshot(locale);
    const claimUrl = `${process.env.PUBLIC_BASE_URL}/${locale}/membership/login`;

    // 1. 优先尝试发送邮件
    if (params.user.email) {
      return this.templateRenderer
        .renderEmail({
          template: 'welcome',
          locale,
          vars: {
            ...baseVars,
            userName:
              params.user.name ||
              (locale === 'zh' ? '亲爱的顾客' : 'Dear Customer'),
            claimUrl,
          },
        })
        .then(({ subject, html, text }) => {
          return this.emailService.sendEmail({
            to: params.user.email!,
            subject,
            html,
            text,
            tags: { type: 'register_welcome' },
            locale: params.user.language === 'ZH' ? 'zh-CN' : 'en',
            templateType: MessagingTemplateType.SIGNUP_WELCOME,
            userId: params.user.id,
            metadata: { trigger: 'register' },
          });
        });
    }

    // 2. 如果没邮箱，但有手机号，发送短信
    if (params.user.phone) {
      const body = await this.templateRenderer.renderSms({
        template: 'welcome',
        locale,
        vars: {
          ...baseVars,
          claimUrl,
        },
      });

      return this.smsService.sendSms({
        phone: params.user.phone,
        body,
        templateType: MessagingTemplateType.SIGNUP_WELCOME,
        locale,
        userId: params.user.id,
        metadata: { trigger: 'register' },
      });
    }
  }

  async notifyOrderReady(params: {
    phone: string;
    orderNumber: string;
    name?: string | null;
  }) {
    const locale = 'en';
    const { baseVars } =
      await this.businessConfigService.getMessagingSnapshot(locale);
    const body = await this.templateRenderer.renderSms({
      template: 'orderReady',
      locale,
      vars: {
        ...baseVars,
        pickupCode: params.orderNumber,
      },
    });
    return this.smsService.sendSms({
      phone: params.phone,
      body,
      templateType: MessagingTemplateType.ORDER_READY,
      locale,
    });
  }

  async notifySubscriptionWelcome(params: { user: User }) {
    // 1. 基础检查
    if (!params.user.email || !params.user.marketingEmailOptIn) {
      return { ok: false, error: 'marketing opt-in missing' };
    }

    // 2. 准备语言环境和基础变量 (Store Name 等)
    const locale = params.user.language === 'ZH' ? 'zh' : 'en';
    const { baseVars } =
      await this.businessConfigService.getMessagingSnapshot(locale);
    const manageUrl = `${process.env.PUBLIC_BASE_URL}/${locale}/membership`;

    // 3. 渲染模版 (Subscription.email.html.hbs)
    const { subject, html, text } = await this.templateRenderer.renderEmail({
      template: 'Subscription',
      locale,
      vars: {
        ...baseVars,
        userName:
          params.user.name ||
          (locale === 'zh' ? '亲爱的顾客' : 'Dear Customer'),
        // 这里生成管理订阅的链接，假设您的前端地址配置在环境变量中
        manageUrl,
      },
    });

    // 4. 发送邮件
    return this.emailService.sendEmail({
      to: params.user.email,
      subject,
      html,
      text,
      tags: { type: 'welcome' }, //以此标记这是欢迎信
      locale: params.user.language === 'ZH' ? 'zh-CN' : 'en',
      templateType: MessagingTemplateType.SUBSCRIPTION_CONFIRM,
      userId: params.user.id,
      metadata: { trigger: 'marketing_opt_in' },
    });
  }

  async notifyCouponIssued(params: {
    user: User;
    program: {
      tittleCh?: string | null;
      tittleEn?: string | null;
      programStableId: string;
      giftValue?: string | null;
      triggerType: CouponProgramTriggerType | null;
    };
  }) {
    const { user, program } = params;
    if (!program.triggerType || !GIFT_CONTENT_MAP[program.triggerType]) {
      return { ok: false, error: 'unsupported_trigger_type' };
    }

    const locale = user.language === 'ZH' ? 'zh' : 'en';
    const content = GIFT_CONTENT_MAP[program.triggerType][locale];
    const { baseVars } =
      await this.businessConfigService.getMessagingSnapshot(locale);
    const claimUrl = `${process.env.PUBLIC_BASE_URL}/${locale}/membership`;
    const giftName =
      program.tittleCh ?? program.tittleEn ?? program.programStableId;
    const userName =
      user.name || (locale === 'zh' ? '亲爱的顾客' : 'Dear Customer');
    const vars = {
      ...baseVars,
      userName,
      giftName,
      giftValue: program.giftValue ?? '',
      claimUrl,
      giftTitle: content.title,
      giftMessage: content.message,
    };
    const template = 'giftGeneral';

    if (user.email) {
      const { subject, html, text } = await this.templateRenderer.renderEmail({
        template,
        locale,
        vars,
      });
      return this.emailService.sendEmail({
        to: user.email,
        subject,
        html,
        text,
        tags: { type: 'gift_issued' },
        locale: user.language === 'ZH' ? 'zh-CN' : 'en',
        templateType: MessagingTemplateType.SIGNUP_WELCOME,
        userId: user.id,
        metadata: { triggerType: program.triggerType ?? null },
      });
    }

    if (user.phone) {
      const body = await this.templateRenderer.renderSms({
        template,
        locale,
        vars,
      });
      return this.smsService.sendSms({
        phone: user.phone,
        body,
        templateType: MessagingTemplateType.SIGNUP_WELCOME,
        locale,
        userId: user.id,
        metadata: { triggerType: program.triggerType ?? null },
      });
    }

    return { ok: false, error: 'no_contact' };
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
      locale: params.user.language === 'ZH' ? 'zh-CN' : 'en',
      templateType: MessagingTemplateType.SUBSCRIPTION_CONFIRM,
      userId: params.user.id,
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
      locale: params.user.language === 'ZH' ? 'zh-CN' : 'en',
      templateType: MessagingTemplateType.SUBSCRIPTION_CONFIRM,
      userId: params.user.id,
    });
  }
}
