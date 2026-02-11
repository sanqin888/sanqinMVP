import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

type PricingTokenPayload = {
  v: 1;
  exp: number;
  totalCents: number;
  fingerprint: string;
};

@Injectable()
export class PricingTokenService {
  private readonly ttlSeconds = 10 * 60;

  issue(params: { totalCents: number; fingerprint: string }): {
    pricingToken: string;
    expiresAt: string;
  } {
    const now = Math.floor(Date.now() / 1000);
    const payload: PricingTokenPayload = {
      v: 1,
      exp: now + this.ttlSeconds,
      totalCents: params.totalCents,
      fingerprint: params.fingerprint,
    };
    const body = b64url(JSON.stringify(payload));
    const sig = this.sign(body);
    return {
      pricingToken: `${body}.${sig}`,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    };
  }

  verify(
    token: string,
    params: { expectedFingerprint: string; expectedTotalCents: number },
  ): PricingTokenPayload {
    const raw = token.trim();
    const [body, sig] = raw.split('.');
    if (!body || !sig) {
      throw new BadRequestException('pricingToken is malformed');
    }

    const expectedSig = this.sign(body);
    if (!safeEqual(sig, expectedSig)) {
      throw new UnauthorizedException('pricingToken signature is invalid');
    }

    let payload: PricingTokenPayload;
    try {
      payload = JSON.parse(b64urlDecode(body)) as PricingTokenPayload;
    } catch {
      throw new BadRequestException('pricingToken payload is invalid');
    }

    if (payload.v !== 1) {
      throw new BadRequestException('pricingToken version is not supported');
    }

    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(payload.exp) || payload.exp <= now) {
      throw new UnauthorizedException('pricingToken is expired');
    }

    if (payload.fingerprint !== params.expectedFingerprint) {
      throw new UnauthorizedException(
        'pricingToken does not match checkout payload',
      );
    }

    if (payload.totalCents !== params.expectedTotalCents) {
      throw new UnauthorizedException(
        'pricingToken amount does not match server quote',
      );
    }

    return payload;
  }

  private sign(body: string): string {
    const secret =
      process.env.CLOVER_PRICING_TOKEN_SECRET?.trim() ||
      process.env.CLOVER_ACCESS_TOKEN?.trim();
    if (!secret) {
      throw new BadRequestException('pricing token secret is not configured');
    }
    return b64url(createHmac('sha256', secret).update(body).digest());
  }
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function b64urlDecode(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  const normalized = pad === 0 ? base64 : base64 + '='.repeat(4 - pad);
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
}
