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

    if (renewed) {
      const baseCookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        signed: true,
        path: '/',
      };
      const isAdminSession =
        session.user?.role === 'ADMIN' || session.user?.role === 'STAFF';
      const maxAge = session.expiresAt.getTime() - Date.now();
      response.cookie(SESSION_COOKIE_NAME, sessionId, {
        ...baseCookieOptions,
        ...(isAdminSession ? {} : { maxAge }),
      });

      const deviceStableId = request.cookies?.[POS_DEVICE_ID_COOKIE];
      const deviceKey = request.cookies?.[POS_DEVICE_KEY_COOKIE];
      if (typeof deviceStableId === 'string' && typeof deviceKey === 'string') {
        response.cookie(POS_DEVICE_ID_COOKIE, deviceStableId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge,
          path: '/',
        });
        response.cookie(POS_DEVICE_KEY_COOKIE, deviceKey, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge,
          path: '/',
        });
      }
    }

    request.user = session.user;
    request.session = session;
    return true;
  }
}
