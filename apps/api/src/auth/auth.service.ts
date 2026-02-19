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
import {
  AuthChallengeStatus,
  AuthChallengeType,
  MessagingChannel,
  MessagingTemplateType,
  UserLanguage,
  type User,
  type TwoFactorMethod,
  type UserRole,
} from '@prisma/client';
import argon2, { argon2id } from 'argon2';
import { normalizeEmail } from '../common/utils/email';
import { normalizePhone } from '../common/utils/phone';
import { EmailService } from '../email/email.service';
import { SmsService } from '../sms/sms.service';
import { BusinessConfigService } from '../messaging/business-config.service';
import { TemplateRenderer } from '../messaging/template-renderer';
import { NotificationService } from '../notifications/notification.service';
import { CouponProgramTriggerService } from '../coupons/coupon-program-trigger.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly smsService: SmsService,
    private readonly templateRenderer: TemplateRenderer,
    private readonly businessConfigService: BusinessConfigService,
    private readonly notificationService: NotificationService,
    private readonly couponTriggerService: CouponProgramTriggerService,
  ) {}

  private async triggerSignupCompletedPrograms(user: User) {
    try {
      await this.couponTriggerService.issueProgramsForUser(
        'SIGNUP_COMPLETED',
        user,
      );
    } catch (error) {
      this.logger.error(
        `Failed to issue signup completed programs for userStableId=${user.userStableId}`,
        (error as Error).stack,
      );
    }
  }

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

  private splitDisplayName(raw: string | null | undefined): {
    firstName?: string;
    lastName?: string;
  } {
    const trimmed = raw?.trim();
    if (!trimmed) {
      return { firstName: undefined, lastName: undefined };
    }
    const parts = trimmed.split(/\s+/);
    const firstName = parts.shift();
    const lastName = parts.length > 0 ? parts.join(' ') : undefined;
    return { firstName, lastName };
  }

  private isTwoFactorEnabled(params: {
    twoFactorEnabledAt: Date | null;
    twoFactorMethod: TwoFactorMethod;
  }): boolean {
    return !!params.twoFactorEnabledAt && params.twoFactorMethod === 'SMS';
  }

  private isAdminRole(role?: UserRole | null): boolean {
    return role === 'ADMIN' || role === 'STAFF' || role === 'ACCOUNTANT';
  }

  private normalizeLanguage(
    language?: string | null,
  ): UserLanguage | undefined {
    if (!language) return undefined;
    const normalized = language.trim().toLowerCase();
    if (normalized.startsWith('zh')) return UserLanguage.ZH;
    if (normalized === 'en') return UserLanguage.EN;
    return undefined;
  }

  private normalizePhoneAddress(raw?: string | null): string | null {
    const normalized = normalizePhone(raw);
    if (!normalized) return null;
    return normalized.startsWith('+') ? normalized : `+${normalized}`;
  }

  private resolveUserLocale(language?: string | null): string | undefined {
    if (language === UserLanguage.ZH) return 'zh-CN';
    if (language === UserLanguage.EN) return 'en';
    if (!language) return undefined;
    const normalized = language.toString().trim().toLowerCase();
    if (normalized.startsWith('zh')) return 'zh-CN';
    if (normalized === 'en') return 'en';
    return undefined;
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

  private async clearDeviceSessions(params: {
    userId: string;
    deviceInfo?: string;
    loginLocation?: string;
  }) {
    if (!params.deviceInfo) return;
    const where: {
      userId: string;
      deviceInfo: string;
      loginLocation?: string;
    } = {
      userId: params.userId,
      deviceInfo: params.deviceInfo,
    };

    if (params.loginLocation) {
      where.loginLocation = params.loginLocation;
    }

    await this.prisma.userSession.deleteMany({ where });
  }

  async revokeSession(sessionId: string) {
    await this.prisma.userSession.deleteMany({
      where: { sessionId },
    });
  }

  async revokeTrustedDeviceByToken(rawToken: string) {
    if (!rawToken) return;
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.trustedDevice.deleteMany({
      where: { tokenHash },
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
    emailVerified: boolean | null;
    name: string | null;
    deviceInfo?: string;
    loginLocation?: string;
    trustedDeviceToken?: string;
    language?: string;
  }) {
    const googleSub = params.googleSub;
    const email = normalizeEmail(params.email);
    const emailVerified = params.emailVerified === true;
    const language = this.normalizeLanguage(params.language);

    if (!googleSub || !email) {
      throw new BadRequestException('invalid oauth params');
    }

    if (!emailVerified) {
      throw new BadRequestException(
        'google email is not verified, please complete email OTP verification first',
      );
    }

    const now = new Date();
    const { firstName, lastName } = this.splitDisplayName(params.name);

    // 2) 选定要登录/绑定的 user（优先 googleSub，其次 email）
    let isNewUser = false;
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
            emailVerifiedAt: emailVerified ? now : null,
            firstName: firstName ?? undefined,
            lastName: lastName ?? undefined,
            googleSub,
            language,
          },
        });
        isNewUser = true;
        return base;
      }

      // 更新绑定信息（不轻易覆盖已有 email/firstName/lastName）
      const nextEmail = base.email ? undefined : email;
      const nextEmailVerified =
        base.emailVerifiedAt || !emailVerified ? undefined : now;
      const nextFirstName = base.firstName ? undefined : firstName;
      const nextLastName = base.lastName ? undefined : lastName;

      const updated = await tx.user.update({
        where: { id: base.id },
        data: {
          googleSub: base.googleSub ?? googleSub,
          email: nextEmail,
          emailVerifiedAt: nextEmailVerified,
          firstName: nextFirstName,
          lastName: nextLastName,
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

    await this.clearDeviceSessions({
      userId: user.id,
      deviceInfo: params.deviceInfo,
      loginLocation: params.loginLocation,
    });

    const session = await this.createSession({
      userId: user.id,
      deviceInfo: params.deviceInfo,
      loginLocation: params.loginLocation,
      mfaVerifiedAt: requiresTwoFactor ? null : now,
    });

    //新增：如果是新用户，发送欢迎通知
    if (isNewUser) {
      void this.notificationService.notifyRegisterWelcome({ user });
      void this.triggerSignupCompletedPrograms(user);
    }

    return { user, session, requiresTwoFactor, isNewUser };
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

    if (
      user.role !== 'ADMIN' &&
      user.role !== 'STAFF' &&
      user.role !== 'ACCOUNTANT'
    ) {
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
    const isAdminLogin = params.purpose === 'admin';
    const isPosLogin = params.purpose === 'pos';

    const isTrusted =
      !isAdminLogin &&
      params.trustedDeviceToken &&
      (await this.findTrustedDevice({
        userId: user.id,
        token: params.trustedDeviceToken,
      }));

    // 如果是 POS 登录，我们认为设备校验通过等同于通过了 MFA，不需要额外的短信验证
    const requiresTwoFactor = isAdminLogin
      ? true
      : !isPosLogin && //如果是 POS 登录，直接跳过 2FA 检查 (requiresTwoFactor = false)
        this.isTwoFactorEnabled({
          twoFactorEnabledAt: user.twoFactorEnabledAt,
          twoFactorMethod: user.twoFactorMethod,
        }) &&
        !isTrusted;

    await this.clearDeviceSessions({
      userId: user.id,
      deviceInfo: params.deviceInfo,
      loginLocation: params.loginLocation,
    });

    // 因为 requiresTwoFactor 变成了 false，这里就会写入 now()，
    // 从而让 AdminMfaGuard 认为该 Session 已通过验证。
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
    const isAdmin = this.isAdminRole(user.role);
    if (
      !isAdmin &&
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

    const addressNorm = this.normalizePhoneAddress(user.phone);
    if (!addressNorm) {
      throw new BadRequestException('invalid phone');
    }

    const recent = await this.prisma.authChallenge.findFirst({
      where: {
        userId: user.id,
        type: AuthChallengeType.TWO_FACTOR,
        channel: { in: [MessagingChannel.SMS, MessagingChannel.EMAIL] },
        purpose: 'LOGIN_2FA',
        createdAt: { gt: oneMinuteAgo },
        status: AuthChallengeStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      throw new BadRequestException('too many requests, please try later');
    }

    const lastHourCount = await this.prisma.authChallenge.count({
      where: {
        userId: user.id,
        type: AuthChallengeType.TWO_FACTOR,
        channel: MessagingChannel.SMS,
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

    const challenge = await this.prisma.authChallenge.create({
      data: {
        userId: user.id,
        type: AuthChallengeType.TWO_FACTOR,
        channel: MessagingChannel.SMS,
        addressNorm,
        addressRaw: user.phone,
        purpose: 'LOGIN_2FA',
        codeHash,
        expiresAt,
        attempts: 0,
        maxAttempts: 5,
        ip: params.ip,
        userAgent: params.userAgent,
      },
    });

    const locale = this.resolveUserLocale(user.language);
    const { baseVars } =
      await this.businessConfigService.getMessagingSnapshot(locale);
    const message = await this.templateRenderer.renderSms({
      template: 'otp',
      locale,
      vars: {
        ...baseVars,
        code,
        expiresInMin: 5,
        purpose: 'login_2fa',
      },
    });

    const sendResult = await this.smsService.sendSms({
      phone: user.phone,
      body: message,
      templateType: MessagingTemplateType.OTP,
      locale,
      userId: user.id,
      metadata: { purpose: 'login_2fa' },
    });
    await this.prisma.authChallenge.update({
      where: { id: challenge.id },
      data: { messagingSendId: sendResult.sendId },
    });
    return { success: true, expiresAt };
  }

  async requestTwoFactorEmail(params: {
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
    const isAdmin = this.isAdminRole(user.role);
    if (
      !isAdmin &&
      !this.isTwoFactorEnabled({
        twoFactorEnabledAt: user.twoFactorEnabledAt,
        twoFactorMethod: user.twoFactorMethod,
      })
    ) {
      throw new BadRequestException('mfa not enabled');
    }

    if (!user.email || !user.emailVerifiedAt) {
      throw new BadRequestException('email not verified');
    }

    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const addressNorm = normalizeEmail(user.email);
    if (!addressNorm) {
      throw new BadRequestException('invalid email');
    }

    const recent = await this.prisma.authChallenge.findFirst({
      where: {
        userId: user.id,
        type: AuthChallengeType.TWO_FACTOR,
        channel: MessagingChannel.EMAIL,
        purpose: 'LOGIN_2FA',
        createdAt: { gt: oneMinuteAgo },
        status: AuthChallengeStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      throw new BadRequestException('too many requests, please try later');
    }

    const lastHourCount = await this.prisma.authChallenge.count({
      where: {
        userId: user.id,
        type: AuthChallengeType.TWO_FACTOR,
        channel: MessagingChannel.EMAIL,
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

    const challenge = await this.prisma.authChallenge.create({
      data: {
        userId: user.id,
        type: AuthChallengeType.TWO_FACTOR,
        channel: MessagingChannel.EMAIL,
        addressNorm,
        addressRaw: user.email,
        purpose: 'LOGIN_2FA',
        codeHash,
        expiresAt,
        attempts: 0,
        maxAttempts: 5,
        ip: params.ip,
        userAgent: params.userAgent,
      },
    });

    const locale = this.resolveUserLocale(user.language);
    const { baseVars } =
      await this.businessConfigService.getMessagingSnapshot(locale);
    const { subject, html, text } = await this.templateRenderer.renderEmail({
      template: 'otp',
      locale,
      vars: {
        ...baseVars,
        code,
        expiresInMin: 5,
        purpose: 'admin_login',
      },
    });

    const sendResult = await this.emailService.sendEmail({
      to: user.email,
      subject,
      text,
      html,
      tags: { type: 'admin_login_2fa' },
      locale,
      templateType: MessagingTemplateType.OTP,
      userId: user.id,
      metadata: { purpose: 'admin_login' },
    });
    await this.prisma.authChallenge.update({
      where: { id: challenge.id },
      data: { messagingSendId: sendResult.sendId },
    });
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
    const challenge = await this.prisma.authChallenge.findFirst({
      where: {
        userId: user.id,
        type: AuthChallengeType.TWO_FACTOR,
        channel: MessagingChannel.SMS,
        purpose: 'LOGIN_2FA',
        status: AuthChallengeStatus.PENDING,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) {
      throw new BadRequestException('verification code is invalid or expired');
    }

    const codeHash = this.hashOtp(params.code.trim());
    if (codeHash !== challenge.codeHash) {
      const nextAttempts = challenge.attempts + 1;
      await this.prisma.authChallenge.update({
        where: { id: challenge.id },
        data: {
          attempts: nextAttempts,
          status:
            nextAttempts >= challenge.maxAttempts
              ? AuthChallengeStatus.REVOKED
              : AuthChallengeStatus.PENDING,
          consumedAt: nextAttempts >= challenge.maxAttempts ? now : null,
        },
      });
      throw new BadRequestException('verification code is invalid or expired');
    }

    await this.prisma.$transaction([
      this.prisma.authChallenge.update({
        where: { id: challenge.id },
        data: { status: AuthChallengeStatus.CONSUMED, consumedAt: now },
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

  async verifyTwoFactorEmail(params: {
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
    const challenge = await this.prisma.authChallenge.findFirst({
      where: {
        userId: user.id,
        type: AuthChallengeType.TWO_FACTOR,
        channel: MessagingChannel.EMAIL,
        purpose: 'LOGIN_2FA',
        status: AuthChallengeStatus.PENDING,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) {
      throw new BadRequestException('verification code is invalid or expired');
    }

    const codeHash = this.hashOtp(params.code.trim());
    if (codeHash !== challenge.codeHash) {
      const nextAttempts = challenge.attempts + 1;
      await this.prisma.authChallenge.update({
        where: { id: challenge.id },
        data: {
          attempts: nextAttempts,
          status:
            nextAttempts >= challenge.maxAttempts
              ? AuthChallengeStatus.REVOKED
              : AuthChallengeStatus.PENDING,
          consumedAt: nextAttempts >= challenge.maxAttempts ? now : null,
        },
      });
      throw new BadRequestException('verification code is invalid or expired');
    }

    await this.prisma.$transaction([
      this.prisma.authChallenge.update({
        where: { id: challenge.id },
        data: { status: AuthChallengeStatus.CONSUMED, consumedAt: now },
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

    await this.prisma.authChallenge.create({
      data: {
        userId: user.id,
        type: AuthChallengeType.PASSWORD_RESET,
        channel: MessagingChannel.EMAIL,
        addressNorm: email,
        addressRaw: user.email,
        tokenHash,
        purpose: 'password_reset',
        expiresAt,
      },
    });

    return { success: true };
  }

  async requestPhoneEnrollOtp(params: { sessionId: string; phone: string }) {
    const session = await this.getSession(params.sessionId);
    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }

    const normalized = normalizePhone(params.phone);
    const addressNorm = this.normalizePhoneAddress(params.phone);
    if (!normalized || !addressNorm || normalized.length < 6) {
      throw new BadRequestException('invalid phone');
    }

    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const recent = await this.prisma.authChallenge.findFirst({
      where: {
        type: AuthChallengeType.PHONE_VERIFY,
        channel: MessagingChannel.SMS,
        addressNorm,
        purpose: 'PHONE_ENROLL',
        createdAt: { gt: oneMinuteAgo },
        status: AuthChallengeStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recent) {
      throw new BadRequestException('too many requests, please try later');
    }

    const lastHourCount = await this.prisma.authChallenge.count({
      where: {
        type: AuthChallengeType.PHONE_VERIFY,
        channel: MessagingChannel.SMS,
        addressNorm,
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
      await tx.authChallenge.updateMany({
        where: {
          type: AuthChallengeType.PHONE_VERIFY,
          channel: MessagingChannel.SMS,
          addressNorm,
          purpose: 'PHONE_ENROLL',
          status: AuthChallengeStatus.PENDING,
        },
        data: { status: AuthChallengeStatus.REVOKED, consumedAt: now },
      });

      await tx.authChallenge.create({
        data: {
          type: AuthChallengeType.PHONE_VERIFY,
          channel: MessagingChannel.SMS,
          addressNorm,
          addressRaw: params.phone,
          codeHash,
          purpose: 'PHONE_ENROLL',
          expiresAt,
        },
      });
    });

    // ================== 添加以下发送短信的代码 ==================
    const locale = this.resolveUserLocale(session.user.language);
    const { baseVars } =
      await this.businessConfigService.getMessagingSnapshot(locale);

    const message = await this.templateRenderer.renderSms({
      template: 'otp',
      locale,
      vars: {
        ...baseVars,
        code,
        expiresInMin: 5,
        purpose: 'verify',
      },
    });

    const sendResult = await this.smsService.sendSms({
      phone: normalized,
      body: message,
      templateType: MessagingTemplateType.OTP,
      locale,
      userId: session.userId,
      metadata: { purpose: 'verify' },
    });
    await this.prisma.authChallenge.updateMany({
      where: {
        type: AuthChallengeType.PHONE_VERIFY,
        channel: MessagingChannel.SMS,
        addressNorm,
        purpose: 'PHONE_ENROLL',
        status: AuthChallengeStatus.PENDING,
      },
      data: { messagingSendId: sendResult.sendId },
    });

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
    const addressNorm = this.normalizePhoneAddress(params.phone);
    if (!normalized || !addressNorm || !params.code) {
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
      const updated = await tx.authChallenge.updateMany({
        where: {
          type: AuthChallengeType.PHONE_VERIFY,
          channel: MessagingChannel.SMS,
          addressNorm,
          purpose: 'PHONE_ENROLL',
          status: AuthChallengeStatus.PENDING,
          expiresAt: { gt: now },
          codeHash,
        },
        data: {
          status: AuthChallengeStatus.CONSUMED,
          consumedAt: now,
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
    const record = await this.prisma.authChallenge.findFirst({
      where: {
        tokenHash,
        type: AuthChallengeType.PASSWORD_RESET,
        status: AuthChallengeStatus.PENDING,
        expiresAt: { gt: now },
      },
    });
    if (!record) {
      throw new BadRequestException('reset token is invalid or expired');
    }
    if (!record.userId) {
      throw new BadRequestException('reset token is invalid or expired');
    }
    const userId = record.userId;

    const passwordHash = await this.hashPassword(params.newPassword);

    await this.prisma.$transaction([
      this.prisma.authChallenge.update({
        where: { id: record.id },
        data: { status: AuthChallengeStatus.CONSUMED, consumedAt: now },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          passwordChangedAt: now,
        },
      }),
      this.prisma.userSession.deleteMany({
        where: { userId },
      }),
      this.prisma.trustedDevice.deleteMany({
        where: { userId },
      }),
    ]);

    return { success: true };
  }

  async requestLoginOtp(params: { phone: string }) {
    const normalized = normalizePhone(params.phone);
    const addressNorm = this.normalizePhoneAddress(params.phone);
    if (!normalized || !addressNorm || normalized.length < 6) {
      throw new BadRequestException('invalid phone');
    }

    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const recent = await this.prisma.authChallenge.findFirst({
      where: {
        type: AuthChallengeType.PHONE_VERIFY,
        channel: MessagingChannel.SMS,
        addressNorm,
        purpose: 'membership-login',
        createdAt: { gt: oneMinuteAgo },
        status: AuthChallengeStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recent) {
      throw new BadRequestException('too many requests, please try later');
    }

    const lastHourCount = await this.prisma.authChallenge.count({
      where: {
        type: AuthChallengeType.PHONE_VERIFY,
        channel: MessagingChannel.SMS,
        addressNorm,
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
      await tx.authChallenge.updateMany({
        where: {
          type: AuthChallengeType.PHONE_VERIFY,
          channel: MessagingChannel.SMS,
          addressNorm,
          purpose: 'membership-login',
          status: AuthChallengeStatus.PENDING,
        },
        data: { status: AuthChallengeStatus.REVOKED, consumedAt: now },
      });

      await tx.authChallenge.create({
        data: {
          type: AuthChallengeType.PHONE_VERIFY,
          channel: MessagingChannel.SMS,
          addressNorm,
          addressRaw: params.phone,
          codeHash,
          purpose: 'membership-login',
          expiresAt,
        },
      });
    });

    // 3.真正调用短信服务发送
    // 构建短信内容（根据需要支持多语言）
    const existingUser = await this.prisma.user.findFirst({
      where: { phone: normalized },
      select: { language: true },
    });
    const locale = this.resolveUserLocale(existingUser?.language ?? null);
    const { baseVars } =
      await this.businessConfigService.getMessagingSnapshot(locale);
    const message = await this.templateRenderer.renderSms({
      template: 'otp',
      locale,
      vars: {
        ...baseVars,
        code,
        expiresInMin: 5,
        purpose: 'login',
      },
    });

    const sendResult = await this.smsService.sendSms({
      phone: normalized, // 注意：这里的 normalized 是不带 + 号的纯数字
      body: message,
      templateType: MessagingTemplateType.OTP,
      locale,
      metadata: { purpose: 'login' },
    });
    await this.prisma.authChallenge.updateMany({
      where: {
        type: AuthChallengeType.PHONE_VERIFY,
        channel: MessagingChannel.SMS,
        addressNorm,
        purpose: 'membership-login',
        status: AuthChallengeStatus.PENDING,
      },
      data: { messagingSendId: sendResult.sendId },
    });

    return { success: true };
  }
  async verifyLoginOtp(params: {
    phone: string;
    code: string;
    deviceInfo?: string;
    loginLocation?: string;
    trustedDeviceToken?: string;
    language?: string;
  }) {
    const normalized = normalizePhone(params.phone);
    const addressNorm = this.normalizePhoneAddress(params.phone);
    if (!normalized || !addressNorm || !params.code) {
      throw new BadRequestException('phone and code are required');
    }

    const now = new Date();
    const record = await this.prisma.authChallenge.findFirst({
      where: {
        type: AuthChallengeType.PHONE_VERIFY,
        channel: MessagingChannel.SMS,
        addressNorm,
        purpose: 'membership-login',
        status: AuthChallengeStatus.PENDING,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    const codeHash = this.hashOtp(params.code);
    if (!record || record.codeHash !== codeHash) {
      throw new BadRequestException('verification code is invalid or expired');
    }

    await this.prisma.authChallenge.update({
      where: { id: record.id },
      data: {
        status: AuthChallengeStatus.CONSUMED,
        consumedAt: now,
      },
    });

    let isNewUser = false;
    let user = await this.prisma.user.findFirst({
      where: { phone: normalized },
    });

    if (!user) {
      const language = this.normalizeLanguage(params.language);
      user = await this.prisma.user.create({
        data: {
          phone: normalized,
          phoneVerifiedAt: now,
          twoFactorEnabledAt: now,
          twoFactorMethod: 'SMS',
          role: 'CUSTOMER',
          language,
        },
      });
      isNewUser = true;
    } else if (!user.phoneVerifiedAt) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { phoneVerifiedAt: now },
      });
    }

    if (params.trustedDeviceToken) {
      await this.findTrustedDevice({
        userId: user.id,
        token: params.trustedDeviceToken,
      });
    }

    await this.clearDeviceSessions({
      userId: user.id,
      deviceInfo: params.deviceInfo,
      loginLocation: params.loginLocation,
    });

    const session = await this.createSession({
      userId: user.id,
      deviceInfo: params.deviceInfo,
      loginLocation: params.loginLocation,
      mfaVerifiedAt: now,
    });

    //如果是新用户，发送欢迎通知
    if (isNewUser) {
      void this.notificationService.notifyRegisterWelcome({ user });
      void this.triggerSignupCompletedPrograms(user);
    }

    return { user, session, verificationToken: record.id, isNewUser };
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

    if (
      params.role !== 'ADMIN' &&
      params.role !== 'STAFF' &&
      params.role !== 'ACCOUNTANT'
    ) {
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
    const { firstName, lastName } = this.splitDisplayName(params.name);

    const user = await this.prisma.user.upsert({
      where: { email: invite.email },
      update: {
        role: invite.role,
        status: 'ACTIVE',
        passwordHash,
        passwordChangedAt: now,
        emailVerifiedAt: now,
        firstName: firstName ?? undefined,
        lastName: lastName ?? undefined,
      },
      create: {
        email: invite.email,
        role: invite.role,
        status: 'ACTIVE',
        passwordHash,
        passwordChangedAt: now,
        emailVerifiedAt: now,
        firstName: firstName ?? undefined,
        lastName: lastName ?? undefined,
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
