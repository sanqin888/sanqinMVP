// apps/api/src/phone-verification/phone-verification.service.ts
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  AuthChallengeStatus,
  AuthChallengeType,
  MessagingChannel,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../common/utils/phone';
import {
  PHONE_VERIFICATION_DELIVERY,
  type PhoneVerificationDeliveryPort,
} from '../messaging/public-api';
import {
  IDENTITY_CHALLENGE_ENGINE,
  type IdentityChallengeEnginePort,
} from '../auth/challenge-engine.port';

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
    @Inject(PHONE_VERIFICATION_DELIVERY)
    private readonly phoneVerificationDelivery: PhoneVerificationDeliveryPort,
    @Inject(IDENTITY_CHALLENGE_ENGINE)
    private readonly challengeEngine: IdentityChallengeEnginePort,
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
      const cutoff = this.challengeEngine
        .windowStart(now, this.ipWindowMs)
        .getTime();
      const recent = timestamps.filter((ts) => ts > cutoff);
      if (this.challengeEngine.limitReached(recent.length, this.ipLimit)) {
        return { ok: false, error: 'too many requests, please try later' };
      }
      recent.push(now.getTime());
      this.ipRequests.set(ip, recent);
    }
    const oneDayAgo = this.challengeEngine.windowStart(
      now,
      24 * 60 * 60 * 1000,
    );
    const expiresAt = this.challengeEngine.expiresAt(now, 10 * 60 * 1000); // 10 分钟有效

    const dailyCount = await this.prisma.authChallenge.count({
      where: {
        type: AuthChallengeType.PHONE_VERIFY,
        channel: MessagingChannel.SMS,
        addressNorm,
        createdAt: { gt: oneDayAgo },
      },
    });

    if (this.challengeEngine.limitReached(dailyCount, 5)) {
      return { ok: false, error: 'too many requests in a day' };
    }

    const code = this.challengeEngine.generateCode('NON_ZERO_SIX_DIGIT');
    const codeHash = this.challengeEngine.hashCode(code, 'PHONE_VERIFICATION');

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

    const smsResult = await this.phoneVerificationDelivery.sendVerificationSms({
      phone: normalized,
      code,
      expiresInMin: 10,
      locale: params.locale,
      purpose: resolvedPurpose,
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
        data: this.challengeEngine.expiredState(now),
      });
      return { ok: false, error: 'code_expired' };
    }

    // 不匹配
    if (
      !this.challengeEngine.verifyCodeHash(
        codeTrimmed,
        latest.codeHash ?? '',
        'PHONE_VERIFICATION',
      )
    ) {
      const failedState = this.challengeEngine.failedAttemptState({
        attempts: latest.attempts,
        maxAttempts: latest.maxAttempts,
        now,
      });
      await this.prisma.authChallenge.update({
        where: { id: latest.id },
        data: failedState,
      });
      return { ok: false, error: 'code_invalid' };
    }

    // ✅ 验证成功：生成一次性 token
    const verificationToken = this.challengeEngine.generateVerificationToken();
    const tokenHash =
      this.challengeEngine.hashVerificationToken(verificationToken);

    await this.prisma.$transaction([
      this.prisma.authChallenge.update({
        where: { id: latest.id },
        data: this.challengeEngine.consumedState(now),
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

  async validateCheckoutVerificationToken(params: {
    phone: string;
    verificationToken: string;
  }): Promise<boolean> {
    const addressNorm = this.normalizePhoneAddress(params.phone);
    const token = params.verificationToken.trim();
    if (!addressNorm || !token) return false;

    const challenge = await this.prisma.authChallenge.findFirst({
      where: {
        type: AuthChallengeType.PHONE_VERIFY,
        channel: MessagingChannel.SMS,
        status: AuthChallengeStatus.PENDING,
        addressNorm,
        purpose: 'checkout',
        tokenHash: this.challengeEngine.hashVerificationToken(token),
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });

    return Boolean(challenge);
  }
}
