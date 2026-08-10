import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Complements the session cookie's SameSite=Lax policy by rejecting browser
 * mutations whose Origin does not match the configured UI origin. Non-browser
 * clients (which do not send Origin) remain supported.
 */
@Injectable()
export class BrowserWriteCsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.headers.origin;
    if (!origin) return true;

    const allowed = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    return allowed.includes(origin);
  }
}
