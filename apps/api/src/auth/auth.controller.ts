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
} from '../pos/pos-device.constants';
import { TRUSTED_DEVICE_COOKIE } from './trusted-device.constants';
import { MfaGuard } from './mfa.guard';
import { AuthGuard } from '@nestjs/passport';
import { GoogleStartGuard } from './oauth/google.guard';
import { OauthStateService } from './oauth/oauth-state.service';
import type { GoogleProfile } from './oauth/google.strategy';

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
  const region =
    readHeader('x-vercel-ip-region') ||
    readHeader('cf-region') ||
    readHeader('x-geo-region');
  const country =
    readHeader('x-vercel-ip-country') ||
    readHeader('cf-country') ||
    readHeader('x-geo-country');

  const segments = [city, region, country]
    .map((segment) => segment?.trim())
    .filter((segment) => segment && segment.toLowerCase() !== 'unknown');

  if (segments.length > 0) {
    return segments.join(', ');
  }

  return undefined;
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
    const deviceInfo = req.headers['user-agent'];
    const loginLocation = resolveLoginLocation(req);
    const stateParam = req.query?.state;
    const stateRaw =
      typeof stateParam === 'string'
        ? stateParam
        : Array.isArray(stateParam) && typeof stateParam[0] === 'string'
          ? stateParam[0]
          : '';
    const { cb } = this.oauthState.verify(stateRaw);
    const cookies = req.cookies as Partial<Record<string, string>> | undefined;
    const trustedDeviceToken =
      typeof cookies?.[TRUSTED_DEVICE_COOKIE] === 'string'
        ? cookies[TRUSTED_DEVICE_COOKIE]
        : undefined;

    const g = req.user as GoogleProfile;

    const result = await this.authService.loginWithGoogleOauth({
      googleSub: g.sub,
      email: g.email,
      name: g.name,
      deviceInfo: typeof deviceInfo === 'string' ? deviceInfo : undefined,
      loginLocation,
      trustedDeviceToken,
    });

    res.cookie(SESSION_COOKIE_NAME, result.session.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      signed: true,
      maxAge: result.session.expiresAt.getTime() - Date.now(),
      path: '/',
    });

    const next = cb || '/';
    if (result.requiresTwoFactor) {
      const params = new URLSearchParams({ next });
      return res.redirect(302, `/membership/2fa?${params.toString()}`);
    }

    return res.redirect(302, next);
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
    const deviceInfo = req.headers['user-agent'];
    const loginLocation = resolveLoginLocation(req);
    const cookies = req.cookies as Partial<Record<string, string>> | undefined;
    const deviceStableId =
      (typeof body?.posDeviceStableId === 'string'
        ? body.posDeviceStableId
        : undefined) ??
      (typeof cookies?.[POS_DEVICE_ID_COOKIE] === 'string'
        ? cookies[POS_DEVICE_ID_COOKIE]
        : undefined);
    const deviceKey =
      (typeof body?.posDeviceKey === 'string'
        ? body.posDeviceKey
        : undefined) ??
      (typeof cookies?.[POS_DEVICE_KEY_COOKIE] === 'string'
        ? cookies[POS_DEVICE_KEY_COOKIE]
        : undefined);
    const trustedDeviceToken =
      typeof cookies?.[TRUSTED_DEVICE_COOKIE] === 'string'
        ? cookies[TRUSTED_DEVICE_COOKIE]
        : undefined;
    const result = await this.authService.loginWithPassword({
      email: body?.email ?? '',
      password: body?.password ?? '',
      purpose: body?.purpose,
      posDeviceStableId:
        typeof deviceStableId === 'string' ? deviceStableId : undefined,
      posDeviceKey: typeof deviceKey === 'string' ? deviceKey : undefined,
      deviceInfo: typeof deviceInfo === 'string' ? deviceInfo : undefined,
      loginLocation,
      trustedDeviceToken,
    });

    res.cookie(SESSION_COOKIE_NAME, result.session.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      signed: true,
      maxAge: result.session.expiresAt.getTime() - Date.now(),
      path: '/',
    });
    // ✅ 仅当 purpose=pos 且设备已通过后端校验后，才下发设备 cookie（用于后续每次请求的 PosDeviceGuard）
    if (body?.purpose === 'pos' && deviceStableId && deviceKey) {
      const maxAge = result.session.expiresAt.getTime() - Date.now();
      res.cookie(POS_DEVICE_ID_COOKIE, deviceStableId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge,
        path: '/',
      });
      res.cookie(POS_DEVICE_KEY_COOKIE, deviceKey, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge,
        path: '/',
      });
    }

    return {
      userStableId: result.user.userStableId,
      email: result.user.email,
      role: result.user.role,
      expiresAt: result.session.expiresAt,
      requiresTwoFactor: result.requiresTwoFactor,
    };
  }

  @Post('login/password')
  async loginMemberPassword(
    @Body() body: { email?: string; password?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const deviceInfo = req.headers['user-agent'];
    const loginLocation = resolveLoginLocation(req);
    const cookies = req.cookies as Partial<Record<string, string>> | undefined;
    const trustedDeviceToken =
      typeof cookies?.[TRUSTED_DEVICE_COOKIE] === 'string'
        ? cookies[TRUSTED_DEVICE_COOKIE]
        : undefined;
    const result = await this.authService.loginWithMemberPassword({
      email: body?.email ?? '',
      password: body?.password ?? '',
      deviceInfo: typeof deviceInfo === 'string' ? deviceInfo : undefined,
      loginLocation,
      trustedDeviceToken,
    });

    res.cookie(SESSION_COOKIE_NAME, result.session.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      signed: true,
      maxAge: result.session.expiresAt.getTime() - Date.now(),
      path: '/',
    });

    return {
      success: true,
      userStableId: result.user.userStableId,
      email: result.user.email,
      role: result.user.role,
      expiresAt: result.session.expiresAt,
      requiresTwoFactor: result.requiresTwoFactor,
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
      res.cookie(TRUSTED_DEVICE_COOKIE, result.trustedDevice.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge,
        path: '/',
      });
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
    const requiresTwoFactor = twoFactorEnabled && !mfaVerifiedAt;

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
    const sessionId = req.signedCookies?.[SESSION_COOKIE_NAME];

    if (typeof sessionId === 'string' && sessionId) {
      await this.authService.revokeSession(sessionId);
    }
    res.clearCookie(POS_DEVICE_ID_COOKIE, { path: '/' });
    res.clearCookie(POS_DEVICE_KEY_COOKIE, { path: '/' });
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.clearCookie(TRUSTED_DEVICE_COOKIE, { path: '/' });
    return { success: true };
  }
}
