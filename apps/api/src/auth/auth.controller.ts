// apps/api/src/auth/auth.controller.ts
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SessionAuthGuard, SESSION_COOKIE_NAME } from './session-auth.guard';
import {
  POS_DEVICE_ID_COOKIE,
  POS_DEVICE_KEY_COOKIE,
  POS_DEVICE_COOKIE_MAX_AGE_DAYS,
} from '../pos/pos-device.constants';
import { TRUSTED_DEVICE_COOKIE } from './trusted-device.constants';
import { MfaGuard } from './mfa.guard';
import { AuthGuard } from '@nestjs/passport';
import { GoogleStartGuard } from './oauth/google.guard';
import { OauthStateService } from './oauth/oauth-state.service';
import type { GoogleProfile } from './oauth/google.strategy';
import type { TwoFactorMethod } from '@prisma/client';
import * as geoip from 'geoip-lite';
import * as requestIp from 'request-ip';
import { UAParser } from 'ua-parser-js';

const resolveDeviceInfo = (req: Request): string => {
  const uaString = req.headers['user-agent'] || '';
  const parser = new UAParser(
    typeof uaString === 'string' ? uaString : (uaString[0] ?? ''),
  );
  const result = parser.getResult();

  const browser = result.browser.name || 'Unknown Browser';
  const os = result.os.name || 'Unknown OS';

  return `${browser} on ${os}`;
};

const resolveLoginLocation = (req: Request): string | undefined => {
  const readHeader = (name: string): string | undefined => {
    const value = req.headers[name];
    if (Array.isArray(value)) return value[0];
    if (typeof value === 'string') return value;
    return undefined;
  };

  const city =
    readHeader('x-vercel-ip-city') ||
    readHeader('cf-ipcity') ||
    readHeader('x-geo-city');
  const country =
    readHeader('x-vercel-ip-country') ||
    readHeader('cf-country') ||
    readHeader('x-geo-country');

  if (city) {
    return country ? `${city}, ${country}` : city;
  }

  const clientIp = requestIp.getClientIp(req);
  if (clientIp) {
    if (clientIp === '::1' || clientIp === '127.0.0.1') {
      return 'Localhost';
    }
    const geo = geoip.lookup(clientIp);
    if (geo) {
      const segments = [geo.city, geo.country]
        .map((segment) => segment?.trim())
        .filter((segment) => segment);
      if (segments.length > 0) {
        return segments.join(', ');
      }
    }
  }

  return 'Unknown Location';
};

const normalizeNextPath = (next?: string): string => {
  if (typeof next === 'string' && next.startsWith('/')) return next;
  return '/';
};

const buildMembershipReferrerRedirect = (
  next: string,
  source: 'google' | 'phone',
): string => {
  const safeNext = normalizeNextPath(next);
  const localeMatch = safeNext.match(/^\/(zh|en)(?:\/|$)/);
  const localePrefix = localeMatch ? `/${localeMatch[1]}` : '';
  const params = new URLSearchParams({ next: safeNext, source });
  return `${localePrefix}/membership/info?${params.toString()}`;
};

const buildMembershipTwoFactorRedirect = (next: string): string => {
  const safeNext = normalizeNextPath(next);
  const localeMatch = safeNext.match(/^\/(zh|en)(?:\/|$)/);
  const localePrefix = localeMatch ? `/${localeMatch[1]}` : '';
  const params = new URLSearchParams({ next: safeNext });
  return `${localePrefix}/membership/2fa?${params.toString()}`;
};

// 辅助函数：统一获取 Cookie 配置
const getCookieOptions = (maxAge?: number) => {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    signed: true,
    path: '/',
    // ✅ 关键修改：生产环境下设置 domain 为 .sanq.ca，让 Cookie 在主域和子域间共享
    domain: isProd ? '.sanq.ca' : undefined,
    maxAge,
  };
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly oauthState: OauthStateService,
  ) {}

  @Get('oauth/google/start')
  @UseGuards(GoogleStartGuard)
  startGoogleOauth() {
    // Guard 会直接 redirect 到 Google
  }

  @Get('oauth/google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const deviceInfo = resolveDeviceInfo(req);
    const loginLocation = resolveLoginLocation(req);
    const stateParam = req.query?.state;
    const stateRaw =
      typeof stateParam === 'string'
        ? stateParam
        : Array.isArray(stateParam) && typeof stateParam[0] === 'string'
          ? stateParam[0]
          : '';
    const { cb, language } = this.oauthState.verify(stateRaw);
    const cookies = req.cookies as Partial<Record<string, string>> | undefined;
    const trustedDeviceToken =
      typeof cookies?.[TRUSTED_DEVICE_COOKIE] === 'string'
        ? cookies[TRUSTED_DEVICE_COOKIE]
        : undefined;

    const g = req.user as GoogleProfile;

    const result = await this.authService.loginWithGoogleOauth({
      googleSub: g.sub,
      email: g.email,
      emailVerified: g.emailVerified,
      name: g.name,
      deviceInfo,
      loginLocation,
      trustedDeviceToken,
      language,
    });

    res.cookie(
      SESSION_COOKIE_NAME,
      result.session.sessionId,
      getCookieOptions(result.session.expiresAt.getTime() - Date.now()),
    );

    const webBaseUrl = process.env.WEB_BASE_URL ?? '';
    const next = normalizeNextPath(cb || '/');
    const redirectTarget = result.isNewUser
      ? buildMembershipReferrerRedirect(next, 'google')
      : next;
    if (result.requiresTwoFactor) {
      return res.redirect(
        302,
        `${webBaseUrl}${buildMembershipTwoFactorRedirect(redirectTarget)}`,
      );
    }

    return res.redirect(302, `${webBaseUrl}${redirectTarget}`);
  }

  @Post('login')
  async login(
    @Body()
    body: {
      email?: string;
      password?: string;
      purpose?: 'pos' | 'admin';
      posDeviceStableId?: string;
      posDeviceKey?: string;
    },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const deviceInfo = resolveDeviceInfo(req);
    const loginLocation = resolveLoginLocation(req);
    const cookies = req.cookies as Partial<Record<string, string>> | undefined;
    const purpose = body?.purpose === 'pos' ? 'pos' : body?.purpose;
    const deviceStableId =
      purpose === 'pos'
        ? ((typeof body?.posDeviceStableId === 'string'
            ? body.posDeviceStableId
            : undefined) ??
          (typeof cookies?.[POS_DEVICE_ID_COOKIE] === 'string'
            ? cookies[POS_DEVICE_ID_COOKIE]
            : undefined))
        : undefined;
    const deviceKey =
      purpose === 'pos'
        ? ((typeof body?.posDeviceKey === 'string'
            ? body.posDeviceKey
            : undefined) ??
          (typeof cookies?.[POS_DEVICE_KEY_COOKIE] === 'string'
            ? cookies[POS_DEVICE_KEY_COOKIE]
            : undefined))
        : undefined;
    const trustedDeviceToken =
      typeof cookies?.[TRUSTED_DEVICE_COOKIE] === 'string'
        ? cookies[TRUSTED_DEVICE_COOKIE]
        : undefined;
    const result = await this.authService.loginWithPassword({
      email: body?.email ?? '',
      password: body?.password ?? '',
      purpose,
      posDeviceStableId:
        typeof deviceStableId === 'string' ? deviceStableId : undefined,
      posDeviceKey: typeof deviceKey === 'string' ? deviceKey : undefined,
      deviceInfo,
      loginLocation,
      trustedDeviceToken,
    });

    const isAdminLogin = purpose === 'admin';
    const maxAge = isAdminLogin
      ? undefined
      : result.session.expiresAt.getTime() - Date.now();

    res.cookie(
      SESSION_COOKIE_NAME,
      result.session.sessionId,
      getCookieOptions(maxAge),
    );

    // ✅ 仅当 purpose=pos 且设备已通过后端校验后，才下发设备 cookie
    if (purpose === 'pos' && deviceStableId && deviceKey) {
      const deviceMaxAge = POS_DEVICE_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

      res.cookie(
        POS_DEVICE_ID_COOKIE,
        deviceStableId,
        getCookieOptions(deviceMaxAge),
      );
      res.cookie(
        POS_DEVICE_KEY_COOKIE,
        deviceKey,
        getCookieOptions(deviceMaxAge),
      );
    }

    return {
      userStableId: result.user.userStableId,
      email: result.user.email,
      role: result.user.role,
      expiresAt: result.session.expiresAt,
      requiresTwoFactor: result.requiresTwoFactor,
    };
  }

  @Post('login/phone/request')
  async requestPhoneLogin(@Body() body: { phone?: string }) {
    return await this.authService.requestLoginOtp({
      phone: body?.phone ?? '',
    });
  }

  @Post('login/phone/verify')
  async verifyPhoneLogin(
    @Body() body: { phone?: string; code?: string; language?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const deviceInfo = resolveDeviceInfo(req);
    const loginLocation = resolveLoginLocation(req);
    const cookies = req.cookies as Partial<Record<string, string>> | undefined;
    const trustedDeviceToken =
      typeof cookies?.[TRUSTED_DEVICE_COOKIE] === 'string'
        ? cookies[TRUSTED_DEVICE_COOKIE]
        : undefined;
    const result = await this.authService.verifyLoginOtp({
      phone: body?.phone ?? '',
      code: body?.code ?? '',
      deviceInfo,
      loginLocation,
      trustedDeviceToken,
      language: body?.language,
    });

    res.cookie(
      SESSION_COOKIE_NAME,
      result.session.sessionId,
      getCookieOptions(result.session.expiresAt.getTime() - Date.now()),
    );

    return {
      userStableId: result.user.userStableId,
      email: result.user.email,
      phone: result.user.phone,
      role: result.user.role,
      expiresAt: result.session.expiresAt,
      isNewUser: result.isNewUser,
    };
  }

  @UseGuards(SessionAuthGuard)
  @Post('2fa/sms/request')
  async requestTwoFactorSms(
    @Req() req: Request & { session?: { sessionId?: string } },
  ) {
    const sessionId = req.session?.sessionId;
    if (!sessionId) {
      throw new ForbiddenException('Missing session');
    }

    return await this.authService.requestTwoFactorSms({
      sessionId,
      ip: req.ip,
      userAgent:
        typeof req.headers['user-agent'] === 'string'
          ? req.headers['user-agent']
          : undefined,
    });
  }

  @UseGuards(SessionAuthGuard)
  @Post('2fa/email/request')
  async requestTwoFactorEmail(
    @Req() req: Request & { session?: { sessionId?: string } },
  ) {
    const sessionId = req.session?.sessionId;
    if (!sessionId) {
      throw new ForbiddenException('Missing session');
    }

    return await this.authService.requestTwoFactorEmail({
      sessionId,
      ip: req.ip,
      userAgent:
        typeof req.headers['user-agent'] === 'string'
          ? req.headers['user-agent']
          : undefined,
    });
  }

  @UseGuards(SessionAuthGuard)
  @Post('2fa/sms/verify')
  async verifyTwoFactorSms(
    @Body()
    body: { code?: string; rememberDevice?: boolean; deviceLabel?: string },
    @Req() req: Request & { session?: { sessionId?: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    const sessionId = req.session?.sessionId;
    if (!sessionId) {
      throw new ForbiddenException('Missing session');
    }

    const result = await this.authService.verifyTwoFactorSms({
      sessionId,
      code: body?.code ?? '',
      rememberDevice: !!body?.rememberDevice,
      deviceLabel:
        typeof body?.deviceLabel === 'string' ? body.deviceLabel : undefined,
    });

    if (result.trustedDevice) {
      const maxAge = result.trustedDevice.expiresAt.getTime() - Date.now();
      res.cookie(
        TRUSTED_DEVICE_COOKIE,
        result.trustedDevice.token,
        getCookieOptions(maxAge),
      );
    }

    return { success: true };
  }

  @UseGuards(SessionAuthGuard)
  @Post('2fa/email/verify')
  async verifyTwoFactorEmail(
    @Body()
    body: { code?: string; rememberDevice?: boolean; deviceLabel?: string },
    @Req() req: Request & { session?: { sessionId?: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    const sessionId = req.session?.sessionId;
    if (!sessionId) {
      throw new ForbiddenException('Missing session');
    }

    const result = await this.authService.verifyTwoFactorEmail({
      sessionId,
      code: body?.code ?? '',
      rememberDevice: !!body?.rememberDevice,
      deviceLabel:
        typeof body?.deviceLabel === 'string' ? body.deviceLabel : undefined,
    });

    if (result.trustedDevice) {
      const maxAge = result.trustedDevice.expiresAt.getTime() - Date.now();
      res.cookie(
        TRUSTED_DEVICE_COOKIE,
        result.trustedDevice.token,
        getCookieOptions(maxAge),
      );
    }

    return { success: true };
  }

  @UseGuards(SessionAuthGuard)
  @Post('phone/enroll/request')
  async requestPhoneEnroll(
    @Body() body: { phone?: string },
    @Req() req: Request & { session?: { sessionId?: string } },
  ) {
    const sessionId = req.session?.sessionId;
    if (!sessionId) {
      throw new ForbiddenException('Missing session');
    }

    return await this.authService.requestPhoneEnrollOtp({
      sessionId,
      phone: body?.phone ?? '',
    });
  }

  @UseGuards(SessionAuthGuard)
  @Post('phone/enroll/verify')
  async verifyPhoneEnroll(
    @Body() body: { phone?: string; code?: string },
    @Req() req: Request & { session?: { sessionId?: string } },
  ) {
    const sessionId = req.session?.sessionId;
    if (!sessionId) {
      throw new ForbiddenException('Missing session');
    }

    return await this.authService.verifyPhoneEnrollOtp({
      sessionId,
      phone: body?.phone ?? '',
      code: body?.code ?? '',
    });
  }

  @UseGuards(SessionAuthGuard)
  @Post('2fa/enable')
  async enableTwoFactor(
    @Req() req: Request & { session?: { sessionId?: string } },
  ) {
    const sessionId = req.session?.sessionId;
    if (!sessionId) {
      throw new ForbiddenException('Missing session');
    }

    return await this.authService.enableTwoFactor({ sessionId });
  }

  @UseGuards(SessionAuthGuard, MfaGuard)
  @Post('2fa/disable')
  async disableTwoFactor(
    @Req() req: Request & { session?: { sessionId?: string } },
  ) {
    const sessionId = req.session?.sessionId;
    if (!sessionId) {
      throw new ForbiddenException('Missing session');
    }

    return await this.authService.disableTwoFactor({ sessionId });
  }

  @Post('password/reset/request')
  async requestPasswordReset(@Body() body: { email?: string }) {
    return await this.authService.requestPasswordReset({
      email: body?.email ?? '',
    });
  }

  @Post('password/reset/confirm')
  async confirmPasswordReset(
    @Body() body: { token?: string; newPassword?: string },
  ) {
    return await this.authService.confirmPasswordReset({
      token: body?.token ?? '',
      newPassword: body?.newPassword ?? '',
    });
  }

  @Post('accept-invite')
  async acceptInvite(
    @Body() body: { token?: string; password?: string; name?: string },
  ) {
    const result = await this.authService.acceptInvite({
      token: body?.token ?? '',
      password: body?.password ?? '',
      name: body?.name,
    });
    return {
      userStableId: result.user.userStableId,
      email: result.user.email,
      role: result.user.role,
    };
  }

  @UseGuards(SessionAuthGuard)
  @Get('me')
  me(
    @Req()
    req: Request & {
      user?: {
        userStableId: string;
        email?: string | null;
        role?: string;
        twoFactorEnabledAt?: Date | null;
        twoFactorMethod?: TwoFactorMethod;
      };
      session?: { mfaVerifiedAt?: Date | null };
    },
  ) {
    const user = req.user;
    if (!user) return null;

    const twoFactorEnabled =
      !!user.twoFactorEnabledAt && user.twoFactorMethod === 'SMS';
    const mfaVerifiedAt = req.session?.mfaVerifiedAt ?? null;
    const isAdminRole = user.role === 'ADMIN' || user.role === 'STAFF';
    const requiresTwoFactor = isAdminRole
      ? !mfaVerifiedAt
      : twoFactorEnabled && !mfaVerifiedAt;

    return {
      userStableId: user.userStableId,
      email: user.email,
      role: user.role,
      mfaVerifiedAt,
      twoFactorEnabled,
      requiresTwoFactor,
    };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawSessionId = (
      req.signedCookies as Record<string, unknown> | undefined
    )?.[SESSION_COOKIE_NAME];

    const sessionId =
      typeof rawSessionId === 'string' ? rawSessionId : undefined;

    const cookies = req.cookies as Partial<Record<string, string>> | undefined;
    const trustedToken = cookies?.[TRUSTED_DEVICE_COOKIE];

    await Promise.all([
      sessionId ? this.authService.revokeSession(sessionId) : Promise.resolve(),
      typeof trustedToken === 'string'
        ? this.authService.revokeTrustedDeviceByToken(trustedToken)
        : Promise.resolve(),
    ]);

    // 清除 Cookie 时也必须带上 domain，否则无法清除带 domain 的 cookie
    const clearOptions = {
      path: '/',
      domain: process.env.NODE_ENV === 'production' ? '.sanq.ca' : undefined,
    };

    res.clearCookie(POS_DEVICE_ID_COOKIE, clearOptions);
    res.clearCookie(POS_DEVICE_KEY_COOKIE, clearOptions);
    res.clearCookie(SESSION_COOKIE_NAME, clearOptions);
    res.clearCookie(TRUSTED_DEVICE_COOKIE, clearOptions);
    return { success: true };
  }
}
