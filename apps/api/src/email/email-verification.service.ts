import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import { randomUUID } from 'crypto';

@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async requestVerification(params: {
    userId: string;
    email: string;
    name?: string | null;
  }) {
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      select: { language: true },
    });

    await this.prisma.emailVerification.create({
      data: {
        userId: params.userId,
        email: params.email,
        token,
        expiresAt,
      },
    });

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
}
