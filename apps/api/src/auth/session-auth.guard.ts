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
        session.user?.role === 'ADMIN' || session.user?.role === 'STAFF';
      const maxAge = session.expiresAt.getTime() - Date.now();

      // ✅ 2. 下发 Session Cookie (带签名)
      response.cookie(SESSION_COOKIE_NAME, sessionId, {
        ...baseCookieOptions,
        signed: true, // Session ID 必须签名
        // Admin 保持会话级 Cookie (关闭浏览器失效)，普通用户设置有效期
        ...(isAdminSession ? {} : { maxAge }),
      });

      // ✅ 3. 下发 POS 设备 Cookie (如果有)
      const deviceStableId = request.cookies?.[POS_DEVICE_ID_COOKIE];
      const deviceKey = request.cookies?.[POS_DEVICE_KEY_COOKIE];

      if (typeof deviceStableId === 'string' && typeof deviceKey === 'string') {
        // POS Cookie 通常不签名，但需要加上 domain 防止跨域丢失
        response.cookie(POS_DEVICE_ID_COOKIE, deviceStableId, {
          ...baseCookieOptions,
          maxAge, // POS 设备 Cookie 跟随 Session 有效期
        });

        response.cookie(POS_DEVICE_KEY_COOKIE, deviceKey, {
          ...baseCookieOptions,
          maxAge,
        });
      }
    }

    request.user = session.user;
    request.session = session;
    return true;
  }
}
