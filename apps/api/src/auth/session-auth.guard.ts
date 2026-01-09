// apps/api/src/auth/session-auth.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

export const SESSION_COOKIE_NAME = 'session_id';

type Session = Awaited<ReturnType<AuthService['getSession']>>;

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      signedCookies?: Record<string, string | undefined>;
      user?: unknown;
      session?: Session;
    }>();
    const sessionId = request.signedCookies?.[SESSION_COOKIE_NAME];
    if (!sessionId) {
      throw new UnauthorizedException('Missing or invalid session cookie');
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
