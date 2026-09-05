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
import { OtpChallengePolicyService } from './otp-challenge-policy.service';
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
    private readonly otpPolicy: OtpChallengePolicyService,
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

    const now = new Date();
    const limitResult = await this.otpPolicy.checkSend({
      profile: 'EMAIL_VERIFY',
      purpose: 'email_verify',
      now,
      userId: user.id,
      addressNorm: email,
    });
    if (!limitResult.ok) {
      return {
        ok: false,
        error:
          limitResult.violation === 'COOLDOWN'
            ? 'too many requests, please try later'
            : 'too many requests in a day',
      };
    }

    const expiresAt = this.challengeEngine.expiresAt(now, 10 * 60 * 1000);
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
      data: sendResult.ok
        ? { messagingSendId: sendResult.sendId }
        : {
            messagingSendId: sendResult.sendId,
            ...this.challengeEngine.revokedState(now),
          },
    });

    if (sendResult.ok) {
      await this.otpPolicy.revokeSupersededCodes({
        profile: 'EMAIL_VERIFY',
        purpose: 'email_verify',
        now,
        userId: user.id,
        addressNorm: email,
        currentChallengeId: challenge.id,
      });
    }

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
    const purpose = params.purpose ?? 'checkout';
    const limitResult = await this.otpPolicy.checkSend({
      profile: 'CHECKOUT',
      purpose,
      now,
      addressNorm: normalized,
      ip: params.ip,
    });
    if (!limitResult.ok) {
      return {
        ok: false,
        error:
          limitResult.violation === 'COOLDOWN'
            ? 'too many requests, please try later'
            : limitResult.violation === 'DAILY_LIMIT'
              ? 'too many requests in a day'
              : 'too many requests in an hour',
      };
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
        purpose,
        expiresAt,
        ip: params.ip,
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
      data: sendResult.ok
        ? { messagingSendId: sendResult.sendId }
        : {
            messagingSendId: sendResult.sendId,
            ...this.challengeEngine.revokedState(now),
          },
    });

    if (sendResult.ok) {
      await this.otpPolicy.revokeSupersededCodes({
        profile: 'CHECKOUT',
        purpose,
        now,
        addressNorm: normalized,
        ip: params.ip,
        currentChallengeId: challenge.id,
      });
    }

    return { ok: true };
  }

  async verifyCheckoutToken(
    params: VerifyCheckoutEmailCodeInput,
  ): Promise<EmailVerificationResult> {
    const normalized = normalizeEmail(params.email);
    const code = params.token.trim();
    const now = new Date();
    const purpose = params.purpose ?? 'checkout';

    if (!normalized || !code) {
      return { ok: false, error: 'email_or_token_empty' };
    }

    const record = await this.prisma.authChallenge.findFirst({
      where: {
        type: AuthChallengeType.EMAIL_VERIFY,
        channel: MessagingChannel.EMAIL,
        status: AuthChallengeStatus.PENDING,
        addressNorm: normalized,
        purpose,
        codeHash: { not: null },
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

    if (
      !this.challengeEngine.verifyCodeHash(code, record.codeHash ?? '', 'OTP')
    ) {
      await this.prisma.authChallenge.update({
        where: { id: record.id },
        data: this.challengeEngine.failedAttemptState({
          attempts: record.attempts,
          maxAttempts: record.maxAttempts,
          now,
        }),
      });
      return { ok: false, error: 'token_not_found' };
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
          purpose,
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

    const now = new Date();

    const record = await this.prisma.authChallenge.findFirst({
      where: {
        type: AuthChallengeType.EMAIL_VERIFY,
        channel: MessagingChannel.EMAIL,
        status: AuthChallengeStatus.PENDING,
        userId: user.id,
        purpose: 'email_verify',
        codeHash: { not: null },
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

    if (
      !this.challengeEngine.verifyCodeHash(code, record.codeHash ?? '', 'OTP')
    ) {
      await this.prisma.authChallenge.update({
        where: { id: record.id },
        data: this.challengeEngine.failedAttemptState({
          attempts: record.attempts,
          maxAttempts: record.maxAttempts,
          now,
        }),
      });
      return { ok: false, error: 'token_not_found' };
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
