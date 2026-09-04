import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuthChallengeStatus,
  AuthChallengeType,
  MessagingChannel,
} from '@prisma/client';

import {
  EMAIL_VERIFICATION_DELIVERY,
  type EmailVerificationDeliveryPort,
} from '../email/public-api';
import { PrismaService } from './identity-prisma';
import {
  IDENTITY_CHALLENGE_ENGINE,
  type IdentityChallengeEnginePort,
} from './challenge-engine.port';
import { normalizeEmail } from './email-normalization';
import type {
  EmailVerificationResult,
  IdentityEmailVerificationPort,
  RequestCheckoutEmailVerificationInput,
  RequestUserEmailVerificationInput,
  ValidateCheckoutEmailVerificationInput,
  VerifyCheckoutEmailCodeInput,
  VerifyUserEmailCodeInput,
} from './email-verification.port';

@Injectable()
export class EmailVerificationService implements IdentityEmailVerificationPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_VERIFICATION_DELIVERY)
    private readonly delivery: EmailVerificationDeliveryPort,
    @Inject(IDENTITY_CHALLENGE_ENGINE)
    private readonly challengeEngine: IdentityChallengeEnginePort,
  ) {}

  async requestUserVerification(
    params: RequestUserEmailVerificationInput,
  ): Promise<EmailVerificationResult> {
    const email = normalizeEmail(params.email);
    if (!email) {
      throw new BadRequestException('invalid_email');
    }

    const user = await this.prisma.user.findUnique({
      where: { userStableId: params.userStableId },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        firstName: true,
        lastName: true,
        language: true,
      },
    });

    if (!user) {
      throw new NotFoundException('user not found');
    }

    const emailOwner = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (emailOwner && emailOwner.id !== user.id) {
      throw new BadRequestException('email_in_use');
    }

    if (user.email === email && user.emailVerifiedAt) {
      return { ok: true, alreadyVerified: true };
    }

    const expiresAt = this.challengeEngine.expiresAt(
      new Date(),
      24 * 60 * 60 * 1000,
    );
    const token = this.challengeEngine.generateCode('ZERO_PADDED');
    const codeHash = this.challengeEngine.hashCode(token, 'OTP');

    const challenge = await this.prisma.authChallenge.create({
      data: {
        userId: user.id,
        type: AuthChallengeType.EMAIL_VERIFY,
        channel: MessagingChannel.EMAIL,
        addressNorm: email,
        addressRaw: email,
        codeHash,
        purpose: 'email_verify',
        expiresAt,
      },
    });

    const sendResult = await this.delivery.sendVerificationEmail({
      to: email,
      token,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
      locale: user.language === 'ZH' ? 'zh' : 'en',
    });

    await this.prisma.authChallenge.update({
      where: { id: challenge.id },
      data: { messagingSendId: sendResult.sendId },
    });

    return { ok: true };
  }

  async requestCheckoutVerification(
    params: RequestCheckoutEmailVerificationInput,
  ): Promise<EmailVerificationResult> {
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

    const sendResult = await this.delivery.sendVerificationEmail({
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

  async verifyCheckoutToken(
    params: VerifyCheckoutEmailCodeInput,
  ): Promise<EmailVerificationResult> {
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

  async validateCheckoutVerificationToken(
    params: ValidateCheckoutEmailVerificationInput,
  ): Promise<boolean> {
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

  async verifyToken(token: string): Promise<EmailVerificationResult> {
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

  async verifyUserEmailCode(
    params: VerifyUserEmailCodeInput,
  ): Promise<EmailVerificationResult> {
    const code = params.code.trim();
    if (!code) {
      throw new BadRequestException('code_required');
    }

    const user = await this.prisma.user.findUnique({
      where: { userStableId: params.userStableId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('user not found');
    }

    const codeHash = this.challengeEngine.hashCode(code, 'OTP');
    const now = new Date();

    const record = await this.prisma.authChallenge.findFirst({
      where: {
        type: AuthChallengeType.EMAIL_VERIFY,
        channel: MessagingChannel.EMAIL,
        status: AuthChallengeStatus.PENDING,
        userId: user.id,
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
        where: { id: user.id },
        data: { emailVerifiedAt: now, email: record.addressNorm },
      }),
    ]);

    return { ok: true, email: record.addressNorm };
  }
}
