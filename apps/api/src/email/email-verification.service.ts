import { Injectable } from '@nestjs/common';
import {
  AuthChallengeStatus,
  AuthChallengeType,
  MessagingChannel,
} from '@prisma/client';
import { randomInt, createHmac } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import { normalizeEmail } from '../common/utils/email';

@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  private generateVerificationCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  private hashCode(code: string): string {
    const secret =
      process.env.OTP_SECRET ?? process.env.OAUTH_STATE_SECRET ?? 'dev-secret';
    return createHmac('sha256', secret).update(code).digest('hex');
  }

  async requestVerification(params: {
    userId: string;
    email: string;
    name?: string | null;
  }) {
    const normalized = normalizeEmail(params.email);
    if (!normalized) {
      return { ok: false, error: 'invalid_email' };
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      select: { language: true },
    });

    const token = this.generateVerificationCode();
    const codeHash = this.hashCode(token);

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

  async verifyToken(token: string) {
    const codeHash = this.hashCode(token);
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
        data: { status: AuthChallengeStatus.EXPIRED, consumedAt: now },
      });
      return { ok: false, error: 'token_expired' };
    }

    await this.prisma.$transaction([
      this.prisma.authChallenge.update({
        where: { id: record.id },
        data: { status: AuthChallengeStatus.CONSUMED, consumedAt: now },
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
    const codeHash = this.hashCode(params.token);
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
        data: { status: AuthChallengeStatus.EXPIRED, consumedAt: now },
      });
      return { ok: false, error: 'token_expired' };
    }

    await this.prisma.$transaction([
      this.prisma.authChallenge.update({
        where: { id: record.id },
        data: { status: AuthChallengeStatus.CONSUMED, consumedAt: now },
      }),
      this.prisma.user.update({
        where: { id: record.userId ?? params.userId },
        data: { emailVerifiedAt: now, email: record.addressNorm },
      }),
    ]);

    return { ok: true, email: record.addressNorm };
  }
}
