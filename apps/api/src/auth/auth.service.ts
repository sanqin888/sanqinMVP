// apps/api/src/auth/auth.service.ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto';
import type { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  private normalizePhone(phone: string): string {
    return phone.replace(/[\s-]+/g, '');
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private generateCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private getSessionTtlMs(): number {
    const raw = process.env.SESSION_TTL_SECONDS;
    const seconds = raw ? Number(raw) : 60 * 60 * 24 * 7;
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new BadRequestException('Invalid SESSION_TTL_SECONDS');
    }
    return seconds * 1000;
  }

  private hashPassword(password: string, salt: string): string {
    return scryptSync(password, salt, 64).toString('hex');
  }

  private verifyPassword(
    password: string,
    salt: string,
    hash: string,
  ): boolean {
    const computed = this.hashPassword(password, salt);
    return timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(computed, 'hex'),
    );
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createSession(params: { userId: string; deviceInfo?: string }) {
    const sessionId = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.getSessionTtlMs());

    await this.prisma.userSession.create({
      data: {
        sessionId,
        userId: params.userId,
        expiresAt,
        deviceInfo: params.deviceInfo,
      },
    });

    return { sessionId, expiresAt };
  }

  async revokeSession(sessionId: string) {
    await this.prisma.userSession.deleteMany({
      where: { sessionId },
    });
  }

  async getSessionUser(sessionId: string) {
    const session = await this.prisma.userSession.findUnique({
      where: { sessionId },
      include: { user: true },
    });

    if (!session) return null;
    if (session.expiresAt <= new Date()) {
      await this.prisma.userSession.delete({ where: { id: session.id } });
      return null;
    }

    if (session.user.status === 'DISABLED') {
      throw new ForbiddenException('User disabled');
    }

    return session.user;
  }

  async loginWithPassword(params: {
    email: string;
    password: string;
    deviceInfo?: string;
  }) {
    const email = this.normalizeEmail(params.email);
    if (!email || !params.password) {
      throw new BadRequestException('email and password are required');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.role !== 'ADMIN' && user.role !== 'STAFF') {
      throw new ForbiddenException('Insufficient role');
    }

    if (user.status === 'DISABLED') {
      throw new ForbiddenException('User disabled');
    }

    if (!user.passwordHash || !user.passwordSalt) {
      throw new UnauthorizedException('Password login not enabled');
    }

    const ok = this.verifyPassword(
      params.password,
      user.passwordSalt,
      user.passwordHash,
    );
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const session = await this.createSession({
      userId: user.id,
      deviceInfo: params.deviceInfo,
    });

    return { user, session };
  }

  async requestLoginOtp(params: { phone: string }) {
    const normalized = this.normalizePhone(params.phone);
    if (!normalized || normalized.length < 6) {
      throw new BadRequestException('invalid phone');
    }

    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const recent = await this.prisma.phoneVerification.findFirst({
      where: {
        phone: normalized,
        purpose: 'membership-login',
        createdAt: { gt: oneMinuteAgo },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recent) {
      throw new BadRequestException('too many requests, please try later');
    }

    const lastHourCount = await this.prisma.phoneVerification.count({
      where: {
        phone: normalized,
        purpose: 'membership-login',
        createdAt: { gt: oneHourAgo },
      },
    });

    if (lastHourCount >= 5) {
      throw new BadRequestException('too many requests in an hour');
    }

    const code = this.generateCode();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);

    await this.prisma.$transaction(async (tx) => {
      await tx.phoneVerification.updateMany({
        where: {
          phone: normalized,
          purpose: 'membership-login',
          used: false,
        },
        data: { used: true },
      });

      await tx.phoneVerification.create({
        data: {
          phone: normalized,
          code,
          purpose: 'membership-login',
          used: false,
          expiresAt,
        },
      });
    });

    this.logger.log(`Login OTP for ${normalized}: ${code}`);
    return { success: true };
  }

  async verifyLoginOtp(params: {
    phone: string;
    code: string;
    deviceInfo?: string;
  }) {
    const normalized = this.normalizePhone(params.phone);
    if (!normalized || !params.code) {
      throw new BadRequestException('phone and code are required');
    }

    const now = new Date();
    const record = await this.prisma.phoneVerification.findFirst({
      where: {
        phone: normalized,
        purpose: 'membership-login',
        used: false,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record || record.code !== params.code) {
      throw new BadRequestException('verification code is invalid or expired');
    }

    await this.prisma.phoneVerification.update({
      where: { id: record.id },
      data: {
        used: true,
        status: 'VERIFIED',
        verifiedAt: now,
      },
    });

    let user = await this.prisma.user.findFirst({
      where: { phone: normalized },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          phone: normalized,
          phoneVerifiedAt: now,
          role: 'CUSTOMER',
        },
      });
    } else if (!user.phoneVerifiedAt) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { phoneVerifiedAt: now },
      });
    }

    const session = await this.createSession({
      userId: user.id,
      deviceInfo: params.deviceInfo,
    });

    return { user, session, verificationToken: record.id };
  }

  async createInvite(params: {
    inviterId: string;
    email: string;
    role: UserRole;
    expiresInHours?: number;
  }) {
    const email = this.normalizeEmail(params.email);
    if (!email) {
      throw new BadRequestException('email is required');
    }

    if (params.role !== 'ADMIN' && params.role !== 'STAFF') {
      throw new BadRequestException('invalid role');
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(
      Date.now() + (params.expiresInHours ?? 72) * 60 * 60 * 1000,
    );

    await this.prisma.userInvite.create({
      data: {
        email,
        role: params.role,
        tokenHash,
        expiresAt,
        invitedByUserId: params.inviterId,
      },
    });

    const webBase = (process.env.WEB_BASE_URL ?? '').replace(/\/$/, '');
    const inviteLink = webBase
      ? `${webBase}/admin/accept-invite?token=${token}`
      : token;

    return { inviteLink };
  }

  async acceptInvite(params: {
    token: string;
    password: string;
    name?: string;
  }) {
    if (!params.token || !params.password) {
      throw new BadRequestException('token and password are required');
    }

    const tokenHash = this.hashToken(params.token);
    const invite = await this.prisma.userInvite.findUnique({
      where: { tokenHash },
    });

    if (!invite || invite.usedAt || invite.expiresAt <= new Date()) {
      throw new BadRequestException('invite is invalid or expired');
    }

    const salt = randomBytes(16).toString('hex');
    const passwordHash = this.hashPassword(params.password, salt);

    const user = await this.prisma.user.upsert({
      where: { email: invite.email },
      update: {
        role: invite.role,
        status: 'ACTIVE',
        passwordHash,
        passwordSalt: salt,
        name: params.name ?? undefined,
      },
      create: {
        email: invite.email,
        role: invite.role,
        status: 'ACTIVE',
        passwordHash,
        passwordSalt: salt,
        name: params.name ?? undefined,
      },
    });

    await this.prisma.userInvite.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    });

    return { user };
  }

  async attachPhoneToUser(params: { userId: string; phone: string }) {
    const { userId, phone } = params;

    const existing = await this.prisma.user.findFirst({
      where: {
        phone,
        id: { not: userId },
      },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException('phone already used by another member');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        phone,
        phoneVerifiedAt: new Date(),
      },
    });
  }
}
