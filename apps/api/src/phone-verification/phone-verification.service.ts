// apps/api/src/phone-verification/phone-verification.service.ts
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  AuthChallengeStatus,
  AuthChallengeType,
  MessagingChannel,
  MessagingTemplateType,
} from '@prisma/client';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../common/utils/phone';
import { SmsService } from '../sms/sms.service';
import { BusinessConfigService } from '../messaging/business-config.service';
import { TemplateRenderer } from '../messaging/template-renderer';

type SendCodeResult = {
  ok: boolean;
  error?: string;
};

export type VerifyCodeResult = {
  ok: boolean;
  verificationToken?: string;
  error?: string;
};

@Injectable()
export class PhoneVerificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PhoneVerificationService.name);
  private readonly ipWindowMs = 60 * 1000;
  private readonly ipLimit = 1;
  private readonly ipCleanupIntervalMs = 60 * 60 * 1000;
  private readonly ipRequests = new Map<string, number[]>();
  private ipCleanupTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly smsService: SmsService,
    private readonly templateRenderer: TemplateRenderer,
    private readonly businessConfigService: BusinessConfigService,
  ) {}

  onModuleInit(): void {
    this.ipCleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [ip, timestamps] of this.ipRequests.entries()) {
        const valid = timestamps.filter((ts) => now - ts < this.ipWindowMs);
        if (valid.length === 0) {
          this.ipRequests.delete(ip);
        } else {
          this.ipRequests.set(ip, valid);
        }
      }
    }, this.ipCleanupIntervalMs);
    this.ipCleanupTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.ipCleanupTimer) {
      clearInterval(this.ipCleanupTimer);
      this.ipCleanupTimer = undefined;
    }
  }

  /** 生成 6 位数字验证码 */
  private generateCode(): string {
    const n = Math.floor(100000 + Math.random() * 900000);
    return String(n);
  }

  private async buildVerificationMessage(
    code: string,
    locale?: string,
  ): Promise<string> {
    const { baseVars } =
      await this.businessConfigService.getMessagingSnapshot(locale);
    return this.templateRenderer.renderSms({
      template: 'otp',
      locale,
      vars: {
        ...baseVars,
        code,
        expiresInMin: 10,
        purpose: 'verify',
      },
    });
  }

  /** 生成验证 token（给前端存起来） */
  private generateVerificationToken(): string {
    return randomBytes(32).toString('hex');
  }

  private hashCode(code: string): string {
    const secret =
      process.env.PHONE_VERIFICATION_SECRET ??
      process.env.OTP_SECRET ??
      process.env.OAUTH_STATE_SECRET ??
      'dev-secret';
    return createHmac('sha256', secret).update(code).digest('hex');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private verifyCodeHash(code: string, codeHash: string): boolean {
    const computed = this.hashCode(code);
    if (computed.length !== codeHash.length) return false;
    return timingSafeEqual(
      Buffer.from(codeHash, 'hex'),
      Buffer.from(computed, 'hex'),
    );
  }

  private normalizePhoneAddress(raw?: string | null): string | null {
    const normalized = normalizePhone(raw);
    if (!normalized) return null;
    return normalized.startsWith('+') ? normalized : `+${normalized}`;
  }

  /** 发送验证码（MVP: 只写入 DB + 日志，不真正发短信） */
  async sendCode(params: {
    phone: string;
    locale?: string;
    purpose?: string;
    ip?: string;
  }): Promise<SendCodeResult> {
    const { phone, purpose, ip } = params;
    const normalized = normalizePhone(phone);
    const addressNorm = this.normalizePhoneAddress(phone);
    if (!normalized || !addressNorm) {
      return { ok: false, error: 'phone is empty' };
    }
    const resolvedPurpose = purpose?.trim() || 'generic';

    const now = new Date();
    if (ip) {
      const timestamps = this.ipRequests.get(ip) ?? [];
      const cutoff = now.getTime() - this.ipWindowMs;
      const recent = timestamps.filter((ts) => ts > cutoff);
      if (recent.length >= this.ipLimit) {
        return { ok: false, error: 'too many requests, please try later' };
      }
      recent.push(now.getTime());
      this.ipRequests.set(ip, recent);
    }
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 分钟有效

    const dailyCount = await this.prisma.authChallenge.count({
      where: {
        type: AuthChallengeType.PHONE_VERIFY,
        channel: MessagingChannel.SMS,
        addressNorm,
        createdAt: { gt: oneDayAgo },
      },
    });

    if (dailyCount >= 5) {
      return { ok: false, error: 'too many requests in a day' };
    }

    const code = this.generateCode();
    const codeHash = this.hashCode(code);

    const challenge = await this.prisma.authChallenge.create({
      data: {
        type: AuthChallengeType.PHONE_VERIFY,
        status: AuthChallengeStatus.PENDING,
        channel: MessagingChannel.SMS,
        addressNorm,
        addressRaw: phone,
        codeHash,
        expiresAt,
        purpose: resolvedPurpose,
      },
    });

    const message = await this.buildVerificationMessage(code, params.locale);
    const smsResult = await this.smsService.sendSms({
      phone: normalized,
      body: message,
      templateType: MessagingTemplateType.OTP,
      locale: params.locale,
      metadata: { purpose: resolvedPurpose },
    });

    await this.prisma.authChallenge.update({
      where: { id: challenge.id },
      data: { messagingSendId: smsResult.sendId },
    });

    if (!smsResult.ok) {
      this.logger.warn(
        `Failed to send verification SMS to ${normalized}: ${smsResult.error ?? 'unknown'}`,
      );
      return { ok: false, error: 'sms_send_failed' };
    }

    return { ok: true };
  }

  /** 校验验证码，成功时返回 verificationToken（用来给前端存起来） */
  async verifyCode(params: {
    phone: string;
    code: string;
    purpose?: string;
  }): Promise<VerifyCodeResult> {
    const { phone, code, purpose } = params;
    const normalized = normalizePhone(phone);
    const addressNorm = this.normalizePhoneAddress(phone);
    const codeTrimmed = code.trim();
    const resolvedPurpose = purpose?.trim() || 'generic';

    if (!normalized || !addressNorm || !codeTrimmed) {
      return { ok: false, error: 'phone or code is empty' };
    }

    const now = new Date();

    // 找到该手机号最近一次验证码记录
    const latest = await this.prisma.authChallenge.findFirst({
      where: {
        type: AuthChallengeType.PHONE_VERIFY,
        channel: MessagingChannel.SMS,
        addressNorm,
        purpose: resolvedPurpose,
        status: AuthChallengeStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!latest) {
      return { ok: false, error: 'code_not_found' };
    }

    // 过期
    if (latest.expiresAt.getTime() < now.getTime()) {
      await this.prisma.authChallenge.update({
        where: { id: latest.id },
        data: {
          status: AuthChallengeStatus.EXPIRED,
          consumedAt: now,
        },
      });
      return { ok: false, error: 'code_expired' };
    }

    // 不匹配
    if (!this.verifyCodeHash(codeTrimmed, latest.codeHash ?? '')) {
      const nextAttempts = latest.attempts + 1;
      await this.prisma.authChallenge.update({
        where: { id: latest.id },
        data: {
          attempts: nextAttempts,
          status:
            nextAttempts >= latest.maxAttempts
              ? AuthChallengeStatus.REVOKED
              : AuthChallengeStatus.PENDING,
          consumedAt: nextAttempts >= latest.maxAttempts ? now : null,
        },
      });
      return { ok: false, error: 'code_invalid' };
    }

    // ✅ 验证成功：生成一次性 token
    const verificationToken = this.generateVerificationToken();
    const tokenHash = this.hashToken(verificationToken);

    await this.prisma.$transaction([
      this.prisma.authChallenge.update({
        where: { id: latest.id },
        data: {
          status: AuthChallengeStatus.CONSUMED,
          consumedAt: now,
        },
      }),
      this.prisma.authChallenge.create({
        data: {
          type: AuthChallengeType.PHONE_VERIFY,
          status: AuthChallengeStatus.PENDING,
          channel: MessagingChannel.SMS,
          addressNorm,
          addressRaw: phone,
          tokenHash,
          purpose: resolvedPurpose,
          expiresAt: latest.expiresAt,
        },
      }),
    ]);

    return {
      ok: true,
      verificationToken,
    };
  }
}
