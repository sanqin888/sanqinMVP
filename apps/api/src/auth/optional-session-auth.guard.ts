import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SESSION_COOKIE_NAME } from './session-auth.guard';

type Session = Awaited<ReturnType<AuthService['getSession']>>;

@Injectable()
export class OptionalSessionAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      signedCookies?: Record<string, string | undefined>;
      user?: unknown;
      session?: Session;
    }>();
    const sessionId = request.signedCookies?.[SESSION_COOKIE_NAME];
    if (typeof sessionId !== 'string' || !sessionId) {
      return true;
    }

    const session = await this.authService.getSession(sessionId);
    if (!session) {
      return true;
    }

    request.user = session.user;
    request.session = session;
    return true;
  }
}
