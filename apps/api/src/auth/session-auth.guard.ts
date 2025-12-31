// apps/api/src/auth/session-auth.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

export const SESSION_COOKIE_NAME = 'session_id';

function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rawKey) return acc;
    const rawValue = rest.join('=');
    acc[rawKey] = decodeURIComponent(rawValue);
    return acc;
  }, {});
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>;
      user?: unknown;
    }>();
    const headers = request.headers ?? {};
    const cookieHeader =
      typeof headers.cookie === 'string'
        ? headers.cookie
        : Array.isArray(headers.cookie)
          ? headers.cookie[0]
          : undefined;
    const cookies = parseCookies(cookieHeader);
    const sessionId = cookies[SESSION_COOKIE_NAME];
    if (!sessionId) {
      throw new UnauthorizedException('Missing session');
    }

    const session = await this.authService.getSession(sessionId);
    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }

    request.user = session.user;
    request.session = session;
    return true;
  }
}
