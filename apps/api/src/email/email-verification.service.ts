import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import { randomInt } from 'crypto';

@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  private generateVerificationCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  async requestVerification(params: {
    userId: string;
    email: string;
    name?: string | null;
  }) {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      select: { language: true },
    });

    let token = '';
    let created = false;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      token = this.generateVerificationCode();
      try {
        await this.prisma.emailVerification.create({
          data: {
            userId: params.userId,
            email: params.email,
            token,
            expiresAt,
          },
        });
        created = true;
        break;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === 'P2002' && attempt < 4) {
            continue;
          }
        }
        throw error;
      }
    }

    if (!created) {
      throw new Error('failed to allocate verification code');
    }

    await this.emailService.sendVerificationEmail({
      to: params.email,
      token,
      name: params.name ?? null,
      locale: user?.language === 'ZH' ? 'zh' : 'en',
    });

    return { ok: true };
  }

  async verifyToken(token: string) {
    const record = await this.prisma.emailVerification.findUnique({
      where: { token },
    });

    if (!record) {
      return { ok: false, error: 'token_not_found' };
    }

    const now = new Date();
    if (record.expiresAt < now || record.consumedAt) {
      return { ok: false, error: 'token_expired' };
    }

    await this.prisma.$transaction([
      this.prisma.emailVerification.update({
        where: { token },
        data: { consumedAt: now },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: now, email: record.email },
      }),
    ]);

    return { ok: true };
  }

  async verifyTokenForUser(params: { token: string; userId: string }) {
    const record = await this.prisma.emailVerification.findUnique({
      where: { token: params.token },
    });

    if (!record || record.userId !== params.userId) {
      return { ok: false, error: 'token_not_found' };
    }

    const now = new Date();
    if (record.expiresAt < now || record.consumedAt) {
      return { ok: false, error: 'token_expired' };
    }

    await this.prisma.$transaction([
      this.prisma.emailVerification.update({
        where: { token: params.token },
        data: { consumedAt: now },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: now, email: record.email },
      }),
    ]);

    return { ok: true, email: record.email };
  }
}
