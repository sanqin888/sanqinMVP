import { Inject, Injectable } from '@nestjs/common';
import {
  AuthChallengeStatus,
  AuthChallengeType,
  MessagingChannel,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import { normalizeEmail } from '../common/utils/email';
import {
  IDENTITY_CHALLENGE_ENGINE,
  type IdentityChallengeEnginePort,
} from '../auth/public-api';

@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    @Inject(IDENTITY_CHALLENGE_ENGINE)
    private readonly challengeEngine: IdentityChallengeEnginePort,
  ) {}

  async requestVerification(params: {
    userId: string;
    email: string;
    name?: string | null;
  }) {
    const normalized = normalizeEmail(params.email);
    if (!normalized) {
      return { ok: false, error: 'invalid_email' };
    }

    const expiresAt = this.challengeEngine.expiresAt(
      new Date(),
      24 * 60 * 60 * 1000,
    );
    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      select: { language: true },
    });

    const token = this.challengeEngine.generateCode('ZERO_PADDED');
    const codeHash = this.challengeEngine.hashCode(token, 'OTP');

    const challenge = await this.prisma.authChallenge.create({
      data: {
        userId: params.userId,
        type: AuthChallengeType.EMAIL_VERIFY,
        channel: MessagingChannel.EMAIL,
        addressNorm: normalized,
        addressRaw: params.email,
        codeHash,
        purpose: 'email_verify',
        expiresAt,
      },
    });

    const sendResult = await this.emailService.sendVerificationEmail({
      to: params.email,
      token,
      name: params.name ?? null,
      locale: user?.language === 'ZH' ? 'zh' : 'en',
    });

    await this.prisma.authChallenge.update({
      where: { id: challenge.id },
      data: { messagingSendId: sendResult.sendId },
    });

    return { ok: true };
  }

  async requestCheckoutVerification(params: {
    email: string;
    locale?: string;
    purpose?: 'checkout';
  }) {
    const normalized = normalizeEmail(params.email);
    if (!normalized) {
      return { ok: false, error: 'invalid_email' };
    }

    const now = new Date();
    const oneDayAgo = this.challengeEngine.windowStart(
      now,
      24 * 60 * 60 * 1000,
    );
    const dailyCount = await this.prisma.authChallenge.count({
      where: {
        type: AuthChallengeType.EMAIL_VERIFY,
        channel: MessagingChannel.EMAIL,
        addressNorm: normalized,
        purpose: params.purpose ?? 'checkout',
        createdAt: { gt: oneDayAgo },
      },
    });

    if (this.challengeEngine.limitReached(dailyCount, 5)) {
      return { ok: false, error: 'too many requests in a day' };
    }

    const expiresAt = this.challengeEngine.expiresAt(now, 10 * 60 * 1000);
    const token = this.challengeEngine.generateCode('ZERO_PADDED');
    const codeHash = this.challengeEngine.hashCode(token, 'OTP');

    const challenge = await this.prisma.authChallenge.create({
      data: {
        type: AuthChallengeType.EMAIL_VERIFY,
        channel: MessagingChannel.EMAIL,
        addressNorm: normalized,
        addressRaw: params.email,
        codeHash,
        purpose: params.purpose ?? 'checkout',
        expiresAt,
      },
    });

    const sendResult = await this.emailService.sendVerificationEmail({
      to: params.email,
      token,
      name: null,
      locale: params.locale === 'zh' ? 'zh' : 'en',
    });

    await this.prisma.authChallenge.update({
      where: { id: challenge.id },
      data: { messagingSendId: sendResult.sendId },
    });

    return { ok: true };
  }

  async verifyCheckoutToken(params: {
    email: string;
    token: string;
    purpose?: 'checkout';
  }) {
    const normalized = normalizeEmail(params.email);
    const codeHash = this.challengeEngine.hashCode(params.token.trim(), 'OTP');
    const now = new Date();

    if (!normalized || !params.token.trim()) {
      return { ok: false, error: 'email_or_token_empty' };
    }

    const record = await this.prisma.authChallenge.findFirst({
      where: {
        type: AuthChallengeType.EMAIL_VERIFY,
        channel: MessagingChannel.EMAIL,
        status: AuthChallengeStatus.PENDING,
        addressNorm: normalized,
        purpose: params.purpose ?? 'checkout',
        codeHash,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      return { ok: false, error: 'token_not_found' };
    }

    if (record.expiresAt < now) {
      await this.prisma.authChallenge.update({
        where: { id: record.id },
        data: this.challengeEngine.expiredState(now),
      });
      return { ok: false, error: 'token_expired' };
    }

    const verificationToken = this.challengeEngine.generateVerificationToken();
    await this.prisma.$transaction([
      this.prisma.authChallenge.update({
        where: { id: record.id },
        data: this.challengeEngine.consumedState(now),
      }),
      this.prisma.authChallenge.create({
        data: {
          type: AuthChallengeType.EMAIL_VERIFY,
          status: AuthChallengeStatus.PENDING,
          channel: MessagingChannel.EMAIL,
          addressNorm: record.addressNorm,
          addressRaw: record.addressRaw,
          tokenHash:
            this.challengeEngine.hashVerificationToken(verificationToken),
          purpose: params.purpose ?? 'checkout',
          expiresAt: record.expiresAt,
        },
      }),
    ]);

    return {
      ok: true,
      email: record.addressNorm,
      verificationToken,
    };
  }

  async validateCheckoutVerificationToken(params: {
    email: string;
    verificationToken: string;
  }): Promise<boolean> {
    const normalized = normalizeEmail(params.email);
    const token = params.verificationToken.trim();
    if (!normalized || !token) return false;

    const challenge = await this.prisma.authChallenge.findFirst({
      where: {
        type: AuthChallengeType.EMAIL_VERIFY,
        channel: MessagingChannel.EMAIL,
        status: AuthChallengeStatus.PENDING,
        addressNorm: normalized,
        purpose: 'checkout',
        tokenHash: this.challengeEngine.hashVerificationToken(token),
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });

    return Boolean(challenge);
  }

  async verifyToken(token: string) {
    const codeHash = this.challengeEngine.hashCode(token, 'OTP');
    const now = new Date();

    const record = await this.prisma.authChallenge.findFirst({
      where: {
        type: AuthChallengeType.EMAIL_VERIFY,
        channel: MessagingChannel.EMAIL,
        status: AuthChallengeStatus.PENDING,
        codeHash,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      return { ok: false, error: 'token_not_found' };
    }

    if (record.expiresAt < now) {
      await this.prisma.authChallenge.update({
        where: { id: record.id },
        data: this.challengeEngine.expiredState(now),
      });
      return { ok: false, error: 'token_expired' };
    }

    await this.prisma.$transaction([
      this.prisma.authChallenge.update({
        where: { id: record.id },
        data: this.challengeEngine.consumedState(now),
      }),
      ...(record.userId
        ? [
            this.prisma.user.update({
              where: { id: record.userId },
              data: { emailVerifiedAt: now, email: record.addressNorm },
            }),
          ]
        : []),
    ]);

    return { ok: true };
  }

  async verifyTokenForUser(params: { token: string; userId: string }) {
    const codeHash = this.challengeEngine.hashCode(params.token, 'OTP');
    const now = new Date();

    const record = await this.prisma.authChallenge.findFirst({
      where: {
        type: AuthChallengeType.EMAIL_VERIFY,
        channel: MessagingChannel.EMAIL,
        status: AuthChallengeStatus.PENDING,
        userId: params.userId,
        codeHash,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      return { ok: false, error: 'token_not_found' };
    }

    if (record.expiresAt < now) {
      await this.prisma.authChallenge.update({
        where: { id: record.id },
        data: this.challengeEngine.expiredState(now),
      });
      return { ok: false, error: 'token_expired' };
    }

    await this.prisma.$transaction([
      this.prisma.authChallenge.update({
        where: { id: record.id },
        data: this.challengeEngine.consumedState(now),
      }),
      this.prisma.user.update({
        where: { id: record.userId ?? params.userId },
        data: { emailVerifiedAt: now, email: record.addressNorm },
      }),
    ]);

    return { ok: true, email: record.addressNorm };
  }
}
