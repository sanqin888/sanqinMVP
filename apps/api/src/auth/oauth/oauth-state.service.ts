// apps/api/src/auth/oauth/oauth-state.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

type Payload = { cb: string; iat: number; language?: 'zh' | 'en' };

function b64url(buf: Buffer) {
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function toB64Json(obj: unknown) {
  return b64url(Buffer.from(JSON.stringify(obj), 'utf8'));
}

function fromB64Json<T>(s: string): T {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return JSON.parse(Buffer.from(b64 + pad, 'base64').toString('utf8')) as T;
}

@Injectable()
export class OauthStateService {
  private readonly secret = process.env.OAUTH_STATE_SECRET ?? '';

  sign(params: { callbackUrl: string; language?: string }) {
    if (!this.secret) throw new Error('Missing OAUTH_STATE_SECRET');

    const cb = this.sanitizeCallback(params.callbackUrl);
    const language = this.normalizeLanguage(params.language);
    const payload: Payload = {
      cb,
      iat: Date.now(),
      ...(language ? { language } : {}),
    };

    const body = toB64Json(payload);
    const sig = this.hmac(body);
    return `${body}.${sig}`;
  }

  verify(state: string): Payload {
    if (!this.secret) throw new Error('Missing OAUTH_STATE_SECRET');

    const [body, sig] = state.split('.');
    if (!body || !sig) throw new UnauthorizedException('Invalid state');

    const expected = this.hmac(body);
    const ok =
      expected.length === sig.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
    if (!ok) throw new UnauthorizedException('Invalid state signature');

    const payload = fromB64Json<Payload>(body);
    if (Date.now() - payload.iat > 10 * 60 * 1000) {
      throw new UnauthorizedException('State expired');
    }
    return payload;
  }

  private hmac(body: string) {
    return b64url(createHmac('sha256', this.secret).update(body).digest());
  }

  private sanitizeCallback(raw: string) {
    if (!raw || typeof raw !== 'string') return '/';
    return raw.startsWith('/') ? raw : '/';
  }

  private normalizeLanguage(raw?: string): 'zh' | 'en' | undefined {
    if (!raw || typeof raw !== 'string') return undefined;
    const normalized = raw.trim().toLowerCase();
    if (normalized.startsWith('zh')) return 'zh';
    if (normalized === 'en') return 'en';
    return undefined;
  }
}
