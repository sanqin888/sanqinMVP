// apps/api/src/auth/auth.service.ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  randomBytes,
  randomInt,
  timingSafeEqual,
  createHash,
  createHmac,
} from 'crypto';
import type { TwoFactorMethod, UserRole } from '@prisma/client';
import argon2, { argon2id } from 'argon2';
import { normalizeEmail } from '../common/utils/email';
import { normalizePhone } from '../common/utils/phone';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  private generateCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private hashDeviceKey(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private verifyDeviceKey(value: string, hash: string): boolean {
    const computed = this.hashDeviceKey(value);
    if (computed.length !== hash.length) return false;
    return timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(computed, 'hex'),
    );
  }

  private getSessionTtlMs(): number {
    const raw = process.env.SESSION_TTL_SECONDS;
    const seconds = raw ? Number(raw) : 60 * 60 * 24 * 7;
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new BadRequestException('Invalid SESSION_TTL_SECONDS');
    }
    return seconds * 1000;
  }

  private getSessionRenewalThresholdMs(): number {
    return 24 * 60 * 60 * 1000;
  }

  private hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2id });
  }

  private verifyPassword(password: string, hash: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private hashOtp(code: string): string {
    const secret =
      process.env.OTP_SECRET ?? process.env.OAUTH_STATE_SECRET ?? 'dev-secret';
    return createHmac('sha256', secret).update(code).digest('hex');
  }

  private isTwoFactorEnabled(params: {
    twoFactorEnabledAt: Date | null;
    twoFactorMethod: TwoFactorMethod;
  }): boolean {
    return !!params.twoFactorEnabledAt && params.twoFactorMethod === 'SMS';
  }

  async createSession(params: {
    userId: string;
    deviceInfo?: string;
    loginLocation?: string;
    mfaVerifiedAt?: Date | null;
  }) {
    const sessionId = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.getSessionTtlMs());

    await this.prisma.userSession.create({
      data: {
        sessionId,
        userId: params.userId,
        expiresAt,
        deviceInfo: params.deviceInfo,
        loginLocation: params.loginLocation,
        mfaVerifiedAt: params.mfaVerifiedAt ?? null,
      },
    });

    return { sessionId, expiresAt };
  }

  async revokeSession(sessionId: string) {
    await this.prisma.userSession.deleteMany({
      where: { sessionId },
    });
  }

  private async loadSession(sessionId: string) {
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

    return session;
  }

  async getSession(sessionId: string) {
    return this.loadSession(sessionId);
  }

  async getSessionWithAutoRenew(sessionId: string) {
    const session = await this.loadSession(sessionId);
    if (!session) {
      return { session: null, renewed: false };
    }

    const remainingMs = session.expiresAt.getTime() - Date.now();
    if (remainingMs > this.getSessionRenewalThresholdMs()) {
      return { session, renewed: false };
    }

    const expiresAt = new Date(Date.now() + this.getSessionTtlMs());
    const updated = await this.prisma.userSession.update({
      where: { id: session.id },
      data: { expiresAt },
      include: { user: true },
    });

    return { session: updated, renewed: true };
  }

  async getSessionUser(sessionId: string) {
    const session = await this.getSession(sessionId);
    return session?.user ?? null;
  }

  async verifySessionMfa(params: { sessionId: string }) {
    const session = await this.getSession(params.sessionId);
    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }
    if (session.mfaVerifiedAt) return session;
    const updated = await this.prisma.userSession.update({
      where: { id: session.id },
      data: { mfaVerifiedAt: new Date() },
      include: { user: true },
    });
    return updated;
  }

  private async findTrustedDevice(params: { userId: string; token: string }) {
    const tokenHash = this.hashToken(params.token);
    const now = new Date();
    const device = await this.prisma.trustedDevice.findFirst({
      where: {
        userId: params.userId,
        tokenHash,
        expiresAt: { gt: now },
      },
    });
    if (!device) return null;
    await this.prisma.trustedDevice.update({
      where: { id: device.id },
      data: { lastSeenAt: now },
    });
    return device;
  }

  private async issueTrustedDevice(params: {
    userId: string;
    label?: string;
    expiresInDays?: number;
  }) {
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(
      Date.now() + (params.expiresInDays ?? 30) * 24 * 60 * 60 * 1000,
    );

    await this.prisma.trustedDevice.create({
      data: {
        userId: params.userId,
        tokenHash,
        label: params.label,
        expiresAt,
      },
    });

    return { token, expiresAt };
  }

  async createTrustedDeviceForUser(params: { userId: string; label?: string }) {
    return this.issueTrustedDevice({
      userId: params.userId,
      label: params.label,
    });
  }

  async loginWithGoogleOauth(params: {
    googleSub: string;
    email: string | null;
    name: string | null;
    deviceInfo?: string;
    loginLocation?: string;
    trustedDeviceToken?: string;
  }) {
    const googleSub = params.googleSub;
    const email = normalizeEmail(params.email);

    if (!googleSub || !email) {
      throw new BadRequestException('invalid oauth params');
    }

    const now = new Date();

    // 2) 选定要登录/绑定的 user（优先 googleSub，其次 email）
    const user = await this.prisma.$transaction(async (tx) => {
      const byGoogle = await tx.user.findFirst({ where: { googleSub } });
      const byEmail = await tx.user.findUnique({ where: { email } });

      if (byGoogle && byEmail && byGoogle.id !== byEmail.id) {
        throw new BadRequestException('account conflict');
      }

      let base = byGoogle ?? byEmail ?? null;

      if (!base) {
        base = await tx.user.create({
          data: {
            role: 'CUSTOMER',
            status: 'ACTIVE',
            email,
            emailVerifiedAt: now,
            name: params.name ?? undefined,
            googleSub,
          },
        });
        return base;
      }

      // 更新绑定信息（不轻易覆盖已有 email/name）
      const nextEmail = base.email ? undefined : email;
      const nextEmailVerified = base.emailVerifiedAt ? undefined : now;
      const nextName = base.name ? undefined : (params.name ?? undefined);

      const updated = await tx.user.update({
        where: { id: base.id },
        data: {
          googleSub: base.googleSub ?? googleSub,
          email: nextEmail,
          emailVerifiedAt: nextEmailVerified,
          name: nextName,
        },
      });

      return updated;
    });

    if (user.status === 'DISABLED') {
      throw new ForbiddenException('User disabled');
    }

    const isTrusted =
      params.trustedDeviceToken &&
      (await this.findTrustedDevice({
        userId: user.id,
        token: params.trustedDeviceToken,
      }));
    const requiresTwoFactor =
      this.isTwoFactorEnabled({
        twoFactorEnabledAt: user.twoFactorEnabledAt,
        twoFactorMethod: user.twoFactorMethod,
      }) && !isTrusted;

    const session = await this.createSession({
      userId: user.id,
      deviceInfo: params.deviceInfo,
      loginLocation: params.loginLocation,
      mfaVerifiedAt: requiresTwoFactor ? null : now,
    });

    return { user, session, requiresTwoFactor };
  }

  async loginWithPassword(params: {
    email: string;
    password: string;
    deviceInfo?: string;
    loginLocation?: string;
    purpose?: 'pos' | 'admin';
    posDeviceStableId?: string;
    posDeviceKey?: string;
    trustedDeviceToken?: string;
  }) {
    const email = normalizeEmail(params.email);
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

    if (params.purpose === 'pos') {
      const deviceStableId = params.posDeviceStableId?.trim();
      const deviceKey = params.posDeviceKey?.trim();
      if (!deviceStableId || !deviceKey) {
        throw new ForbiddenException('Missing POS device credentials');
      }

      const device = await this.prisma.posDevice.findUnique({
        where: { deviceStableId },
      });

      if (!device || device.status !== 'ACTIVE') {
        throw new ForbiddenException('POS device not authorized');
      }

      if (!this.verifyDeviceKey(deviceKey, device.deviceKeyHash)) {
        throw new ForbiddenException('POS device not authorized');
      }

      await this.prisma.posDevice.update({
        where: { id: device.id },
        data: { lastSeenAt: new Date() },
      });
    }

    if (user.status === 'DISABLED') {
      throw new ForbiddenException('User disabled');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Password login not enabled');
    }

    const ok = await this.verifyPassword(params.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const now = new Date();
    const isTrusted =
      params.trustedDeviceToken &&
      (await this.findTrustedDevice({
        userId: user.id,
        token: params.trustedDeviceToken,
      }));
    const requiresTwoFactor =
      this.isTwoFactorEnabled({
        twoFactorEnabledAt: user.twoFactorEnabledAt,
        twoFactorMethod: user.twoFactorMethod,
      }) && !isTrusted;

    const session = await this.createSession({
      userId: user.id,
      deviceInfo: params.deviceInfo,
      loginLocation: params.loginLocation,
      mfaVerifiedAt: requiresTwoFactor ? null : now,
    });

    return { user, session, requiresTwoFactor };
  }

  async loginWithMemberPassword(params: {
    email: string;
    password: string;
    deviceInfo?: string;
    loginLocation?: string;
    trustedDeviceToken?: string;
  }) {
    const email = normalizeEmail(params.email);
    if (!email || !params.password) {
      throw new BadRequestException('email and password are required');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === 'DISABLED') {
      throw new ForbiddenException('User disabled');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Password login not enabled');
    }

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException('Email not verified');
    }

    const ok = await this.verifyPassword(params.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const now = new Date();
    const isTrusted =
      params.trustedDeviceToken &&
      (await this.findTrustedDevice({
        userId: user.id,
        token: params.trustedDeviceToken,
      }));
    const requiresTwoFactor =
      this.isTwoFactorEnabled({
        twoFactorEnabledAt: user.twoFactorEnabledAt,
        twoFactorMethod: user.twoFactorMethod,
      }) && !isTrusted;

    const session = await this.createSession({
      userId: user.id,
      deviceInfo: params.deviceInfo,
      loginLocation: params.loginLocation,
      mfaVerifiedAt: requiresTwoFactor ? null : now,
    });

    return { user, session, requiresTwoFactor };
  }

  async requestTwoFactorSms(params: {
    sessionId: string;
    ip?: string;
    userAgent?: string;
  }) {
    const session = await this.getSession(params.sessionId);
    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }
    if (session.mfaVerifiedAt) {
      throw new BadRequestException('mfa already verified');
    }

    const user = session.user;
    if (
      !this.isTwoFactorEnabled({
        twoFactorEnabledAt: user.twoFactorEnabledAt,
        twoFactorMethod: user.twoFactorMethod,
      })
    ) {
      throw new BadRequestException('mfa not enabled');
    }

    if (!user.phone || !user.phoneVerifiedAt) {
      throw new BadRequestException('phone not verified');
    }

    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const recent = await this.prisma.twoFactorChallenge.findFirst({
      where: {
        userId: user.id,
        purpose: 'LOGIN_2FA',
        createdAt: { gt: oneMinuteAgo },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      throw new BadRequestException('too many requests, please try later');
    }

    const lastHourCount = await this.prisma.twoFactorChallenge.count({
      where: {
        userId: user.id,
        purpose: 'LOGIN_2FA',
        createdAt: { gt: oneHourAgo },
      },
    });
    if (lastHourCount >= 5) {
      throw new BadRequestException('too many requests in an hour');
    }

    const code = this.generateCode();
    const codeHash: string = this.hashOtp(code);
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);

    await this.prisma.twoFactorChallenge.create({
      data: {
        userId: user.id,
        purpose: 'LOGIN_2FA',
        codeHash,
        expiresAt,
        attempts: 0,
        maxAttempts: 5,
        ip: params.ip,
        userAgent: params.userAgent,
      },
    });

    this.logger.log(`2FA OTP for ${user.phone}: ${code}`);
    return { success: true, expiresAt };
  }

  async verifyTwoFactorSms(params: {
    sessionId: string;
    code: string;
    rememberDevice?: boolean;
    deviceLabel?: string;
  }) {
    const session = await this.getSession(params.sessionId);
    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }
    if (session.mfaVerifiedAt) {
      return { success: true, alreadyVerified: true };
    }

    const user = session.user;
    const now = new Date();
    const challenge = await this.prisma.twoFactorChallenge.findFirst({
      where: {
        userId: user.id,
        purpose: 'LOGIN_2FA',
        consumedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) {
      throw new BadRequestException('verification code is invalid or expired');
    }

    const codeHash = this.hashOtp(params.code);
    if (codeHash !== challenge.codeHash) {
      const nextAttempts = challenge.attempts + 1;
      await this.prisma.twoFactorChallenge.update({
        where: { id: challenge.id },
        data: {
          attempts: nextAttempts,
          consumedAt: nextAttempts >= challenge.maxAttempts ? now : null,
        },
      });
      throw new BadRequestException('verification code is invalid or expired');
    }

    await this.prisma.$transaction([
      this.prisma.twoFactorChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: now },
      }),
      this.prisma.userSession.update({
        where: { id: session.id },
        data: { mfaVerifiedAt: now },
      }),
    ]);

    let trustedDevice: { token: string; expiresAt: Date } | null = null;
    if (params.rememberDevice) {
      trustedDevice = await this.issueTrustedDevice({
        userId: user.id,
        label: params.deviceLabel,
      });
    }

    return {
      success: true,
      trustedDevice,
    };
  }

  async requestPasswordReset(params: { email: string }) {
    const email = normalizeEmail(params.email);
    if (!email) {
      return { success: true };
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash || user.status === 'DISABLED') {
      return { success: true };
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    this.logger.log(`[DEV] Password reset token for ${email}: ${token}`);

    return { success: true };
  }

  async requestPhoneEnrollOtp(params: { sessionId: string; phone: string }) {
    const session = await this.getSession(params.sessionId);
    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }

    const normalized = normalizePhone(params.phone);
    if (!normalized || normalized.length < 6) {
      throw new BadRequestException('invalid phone');
    }

    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const recent = await this.prisma.phoneVerification.findFirst({
      where: {
        phone: normalized,
        purpose: 'PHONE_ENROLL',
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
        purpose: 'PHONE_ENROLL',
        createdAt: { gt: oneHourAgo },
      },
    });

    if (lastHourCount >= 5) {
      throw new BadRequestException('too many requests in an hour');
    }

    const code = this.generateCode();
    const codeHash: string = this.hashOtp(code);
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);

    await this.prisma.$transaction(async (tx) => {
      await tx.phoneVerification.updateMany({
        where: {
          phone: normalized,
          purpose: 'PHONE_ENROLL',
          used: false,
        },
        data: { used: true },
      });

      await tx.phoneVerification.create({
        data: {
          phone: normalized,
          codeHash,
          purpose: 'PHONE_ENROLL',
          used: false,
          expiresAt,
        },
      });
    });

    this.logger.log(`Phone enroll OTP for ${normalized}: ${code}`);
    return { success: true };
  }

  async verifyPhoneEnrollOtp(params: {
    sessionId: string;
    phone: string;
    code: string;
  }) {
    const session = await this.getSession(params.sessionId);
    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }

    const normalized = normalizePhone(params.phone);
    if (!normalized || !params.code) {
      throw new BadRequestException('phone and code are required');
    }

    const now = new Date();
    const codeHash = this.hashOtp(params.code);

    const conflict = await this.prisma.user.findFirst({
      where: {
        phone: normalized,
        NOT: { id: session.userId },
      },
      select: { id: true },
    });
    if (conflict) {
      throw new BadRequestException('phone already in use');
    }

    const verification = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.phoneVerification.updateMany({
        where: {
          phone: normalized,
          purpose: 'PHONE_ENROLL',
          used: false,
          expiresAt: { gt: now },
          codeHash,
        },
        data: {
          used: true,
          status: 'VERIFIED',
          verifiedAt: now,
        },
      });

      if (updated.count === 0) {
        return { verified: false };
      }

      await tx.user.update({
        where: { id: session.userId },
        data: {
          phone: normalized,
          phoneVerifiedAt: now,
        },
      });

      return { verified: true };
    });

    if (!verification.verified) {
      throw new BadRequestException('verification code is invalid or expired');
    }

    return { success: true };
  }

  async enableTwoFactor(params: { sessionId: string }) {
    const session = await this.getSession(params.sessionId);
    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }

    if (!session.user.phone || !session.user.phoneVerifiedAt) {
      throw new BadRequestException('phone not verified');
    }

    const now = new Date();
    await this.prisma.user.update({
      where: { id: session.userId },
      data: {
        twoFactorEnabledAt: now,
        twoFactorMethod: 'SMS',
      },
    });

    return { success: true };
  }

  async disableTwoFactor(params: { sessionId: string }) {
    const session = await this.getSession(params.sessionId);
    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }

    await this.prisma.user.update({
      where: { id: session.userId },
      data: {
        twoFactorEnabledAt: null,
        twoFactorMethod: 'OFF',
      },
    });

    await this.prisma.trustedDevice.deleteMany({
      where: { userId: session.userId },
    });

    return { success: true };
  }

  async confirmPasswordReset(params: { token: string; newPassword: string }) {
    if (!params.token || !params.newPassword) {
      throw new BadRequestException('token and newPassword are required');
    }

    const tokenHash = this.hashToken(params.token);
    const now = new Date();
    const record = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: now },
      },
    });
    if (!record) {
      throw new BadRequestException('reset token is invalid or expired');
    }

    const passwordHash = await this.hashPassword(params.newPassword);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: now },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          passwordChangedAt: now,
        },
      }),
      this.prisma.userSession.deleteMany({
        where: { userId: record.userId },
      }),
      this.prisma.trustedDevice.deleteMany({
        where: { userId: record.userId },
      }),
    ]);

    return { success: true };
  }

  async requestLoginOtp(params: { phone: string }) {
    const normalized = normalizePhone(params.phone);
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
    const codeHash = this.hashOtp(code);
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
          codeHash,
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
    const normalized = normalizePhone(params.phone);
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

    const codeHash = this.hashOtp(params.code);
    if (!record || record.codeHash !== codeHash) {
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

    const requiresTwoFactor = this.isTwoFactorEnabled({
      twoFactorEnabledAt: user.twoFactorEnabledAt,
      twoFactorMethod: user.twoFactorMethod,
    });

    const session = await this.createSession({
      userId: user.id,
      deviceInfo: params.deviceInfo,
      mfaVerifiedAt: requiresTwoFactor ? null : now,
    });

    return { user, session, verificationToken: record.id };
  }

  // apps/api/src/auth/auth.service.ts

  async createStaffInvite(params: {
    inviterId: string;
    email: string;
    role: UserRole;
    expiresInHours?: number;
  }) {
    const email = normalizeEmail(params.email);
    if (!email) {
      throw new BadRequestException('email is required');
    }

    if (params.role !== 'ADMIN' && params.role !== 'STAFF') {
      throw new BadRequestException('invalid role');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingUser) {
      throw new BadRequestException('email already registered');
    }

    const existingInvite = await this.prisma.userInvite.findFirst({
      where: { email },
      orderBy: { createdAt: 'desc' },
      include: { invitedBy: { select: { userStableId: true } } },
    });

    const now = new Date();

    // 统一：每次“发送邀请”都生成新 token（更贴近真实发邮件行为）
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(
      now.getTime() + (params.expiresInHours ?? 168) * 60 * 60 * 1000,
    );

    if (existingInvite) {
      if (existingInvite.usedAt) {
        throw new BadRequestException('invite already accepted');
      }
      if (existingInvite.revokedAt) {
        // revoked 的 invite 可以“重新发送”，这里不做过多限制
      } else {
        // 未撤销时做限流（和 resend 保持一致）
        if (
          existingInvite.lastSentAt &&
          now.getTime() - existingInvite.lastSentAt.getTime() < 60 * 1000
        ) {
          throw new BadRequestException('invite resend too soon');
        }
        if (
          (existingInvite.sentCount ?? 0) >= 5 &&
          now.getTime() -
            (existingInvite.lastSentAt?.getTime() ??
              existingInvite.createdAt.getTime()) <
            24 * 60 * 60 * 1000
        ) {
          throw new BadRequestException('invite resend limit reached');
        }
      }

      const invite = await this.prisma.userInvite.update({
        where: { id: existingInvite.id },
        data: {
          role: params.role,
          tokenHash,
          expiresAt,
          invitedByUserId: params.inviterId,
          revokedAt: null,
          lastSentAt: now,
          sentCount: (existingInvite.sentCount ?? 0) + 1,
        },
        include: { invitedBy: { select: { userStableId: true } } },
      });

      return { invite, token };
    }

    const invite = await this.prisma.userInvite.create({
      data: {
        email,
        role: params.role,
        tokenHash,
        expiresAt,
        invitedByUserId: params.inviterId,
        sentCount: 1,
        lastSentAt: now,
      },
      include: { invitedBy: { select: { userStableId: true } } },
    });

    return { invite, token };
  }

  async resendStaffInvite(inviteStableId: string) {
    const invite = await this.prisma.userInvite.findUnique({
      where: { inviteStableId },
      include: { invitedBy: { select: { userStableId: true } } },
    });
    if (!invite) {
      throw new BadRequestException('invite not found');
    }
    if (invite.usedAt) {
      throw new BadRequestException('invite already accepted');
    }
    if (invite.revokedAt) {
      throw new BadRequestException('invite revoked');
    }

    const now = new Date();
    if (
      invite.lastSentAt &&
      now.getTime() - invite.lastSentAt.getTime() < 60 * 1000
    ) {
      throw new BadRequestException('invite resend too soon');
    }
    if (
      (invite.sentCount ?? 0) >= 5 &&
      now.getTime() -
        (invite.lastSentAt?.getTime() ?? invite.createdAt.getTime()) <
        24 * 60 * 60 * 1000
    ) {
      throw new BadRequestException('invite resend limit reached');
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(now.getTime() + 168 * 60 * 60 * 1000);

    const updated = await this.prisma.userInvite.update({
      where: { id: invite.id },
      data: {
        tokenHash,
        expiresAt,
        lastSentAt: now,
        sentCount: (invite.sentCount ?? 0) + 1,
      },
      include: { invitedBy: { select: { userStableId: true } } },
    });

    return { invite: updated, token };
  }

  async revokeStaffInvite(inviteStableId: string) {
    const invite = await this.prisma.userInvite.findUnique({
      where: { inviteStableId },
      include: { invitedBy: { select: { userStableId: true } } },
    });
    if (!invite) {
      throw new BadRequestException('invite not found');
    }
    if (invite.usedAt) {
      throw new BadRequestException('invite already accepted');
    }

    return this.prisma.userInvite.update({
      where: { id: invite.id },
      data: { revokedAt: new Date() },
      include: { invitedBy: { select: { userStableId: true } } },
    });
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

    if (
      !invite ||
      invite.usedAt ||
      invite.revokedAt ||
      invite.expiresAt <= new Date()
    ) {
      throw new BadRequestException('invite is invalid or expired');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: invite.email },
      select: { id: true },
    });
    if (existingUser) {
      throw new BadRequestException('email already registered');
    }

    const passwordHash = await this.hashPassword(params.password);
    const now = new Date();

    const user = await this.prisma.user.upsert({
      where: { email: invite.email },
      update: {
        role: invite.role,
        status: 'ACTIVE',
        passwordHash,
        passwordChangedAt: now,
        emailVerifiedAt: now,
        name: params.name ?? undefined,
      },
      create: {
        email: invite.email,
        role: invite.role,
        status: 'ACTIVE',
        passwordHash,
        passwordChangedAt: now,
        emailVerifiedAt: now,
        name: params.name ?? undefined,
      },
    });

    await this.prisma.userInvite.update({
      where: { id: invite.id },
      data: { usedAt: now },
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
