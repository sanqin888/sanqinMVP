// apps/api/src/auth/admin-auth.guard.ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { decode } from 'next-auth/jwt';
import { isAdminEmail } from './admin-access';

const SESSION_COOKIE_NAMES = [
  '__Secure-next-auth.session-token',
  '__Host-next-auth.session-token',
  'next-auth.session-token',
];

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

function getSessionToken(cookieHeader?: string): string | undefined {
  const cookies = parseCookies(cookieHeader);
  for (const name of SESSION_COOKIE_NAMES) {
    const value = cookies[name];
    if (value) return value;
  }
  return undefined;
}

function getBearerToken(header?: string): string | undefined {
  if (!header) return undefined;
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) return undefined;
  return value.trim();
}

type NextAuthToken = {
  email?: string | null;
  role?: string;
};

@Injectable()
export class AdminAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>;
    }>();
    const headers = request.headers ?? {};
    const authHeader =
      typeof headers.authorization === 'string'
        ? headers.authorization
        : Array.isArray(headers.authorization)
          ? headers.authorization[0]
          : undefined;
    const cookieHeader =
      typeof headers.cookie === 'string'
        ? headers.cookie
        : Array.isArray(headers.cookie)
          ? headers.cookie[0]
          : undefined;

    const token = getBearerToken(authHeader) ?? getSessionToken(cookieHeader);
    if (!token) {
      throw new UnauthorizedException('Missing auth token');
    }

    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      throw new UnauthorizedException('Missing NEXTAUTH_SECRET');
    }

    const decoded = (await decode({ token, secret })) as NextAuthToken | null;
    if (!decoded) {
      throw new UnauthorizedException('Invalid session token');
    }

    const email = typeof decoded.email === 'string' ? decoded.email : undefined;
    const role = typeof decoded.role === 'string' ? decoded.role : undefined;

    const isAdmin = role === 'ADMIN' && isAdminEmail(email);
    if (!isAdmin) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
