// apps/api/src/auth/session-auth.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import {
  POS_DEVICE_ID_COOKIE,
  POS_DEVICE_KEY_COOKIE,
  POS_DEVICE_COOKIE_MAX_AGE_MS,
} from '../pos/pos-device.constants';

export const SESSION_COOKIE_NAME = 'session_id';

type Session = Awaited<ReturnType<AuthService['getSession']>>;

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      cookies?: Record<string, string | undefined>;
      signedCookies?: Record<string, string | undefined>;
      user?: unknown;
      session?: Session;
    }>();
    const sessionId = request.signedCookies?.[SESSION_COOKIE_NAME];
    if (!sessionId) {
      throw new UnauthorizedException('Missing or invalid session cookie');
    }

    const response = context.switchToHttp().getResponse<Response>();
    const { session, renewed } =
      await this.authService.getSessionWithAutoRenew(sessionId);
    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }

    // 当 Session 自动续期时，需要重新下发 Cookie
    if (renewed) {
      const isProd = process.env.NODE_ENV === 'production';

      // ✅ 1. 定义基础配置，重点是加上 domain
      const baseCookieOptions = {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax' as const,
        path: '/',
        // 👇 关键修复：确保自动续期的 Cookie 也能跨子域名共享
        domain: isProd ? '.sanq.ca' : undefined,
      };

      const isAdminSession =
        session.user?.role === 'ADMIN' ||
        session.user?.role === 'STAFF' ||
        session.user?.role === 'ACCOUNTANT';
      const sessionMaxAge = session.expiresAt.getTime() - Date.now();
      const deviceStableId =
        request.signedCookies?.[POS_DEVICE_ID_COOKIE] ??
        request.cookies?.[POS_DEVICE_ID_COOKIE];
      const deviceKey =
        request.signedCookies?.[POS_DEVICE_KEY_COOKIE] ??
        request.cookies?.[POS_DEVICE_KEY_COOKIE];
      const isPosSession =
        typeof deviceStableId === 'string' && typeof deviceKey === 'string';

      // ✅ 2. 下发 Session Cookie (带签名)
      response.cookie(SESSION_COOKIE_NAME, sessionId, {
        ...baseCookieOptions,
        signed: true, // Session ID 必须签名
        // POS 端必须保留持久化 Session，否则重启浏览器/设备后会立即丢登录态。
        // 只有非 POS 的后台账号仍保持会话级 Cookie。
        ...(!isAdminSession || isPosSession ? { maxAge: sessionMaxAge } : {}),
      });

      // ✅ 3. 下发 POS 设备 Cookie (如果有)
      if (isPosSession) {
        // POS 设备 Cookie 需要长期保留；不能跟随 Session 续期窗口缩短，否则会导致设备被迫重新绑定。
        response.cookie(POS_DEVICE_ID_COOKIE, deviceStableId, {
          ...baseCookieOptions,
          signed: true,
          maxAge: POS_DEVICE_COOKIE_MAX_AGE_MS,
        });

        response.cookie(POS_DEVICE_KEY_COOKIE, deviceKey, {
          ...baseCookieOptions,
          signed: true,
          maxAge: POS_DEVICE_COOKIE_MAX_AGE_MS,
        });
      }
    }

    request.user = session.user;
    request.session = session;
    return true;
  }
}
