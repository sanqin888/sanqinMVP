import { Injectable } from '@nestjs/common';
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'crypto';
import type {
  ChallengeCodeFormat,
  ChallengeFailedAttemptState,
  ChallengeLifecycleState,
  ChallengeSecretKind,
  IdentityChallengeEnginePort,
} from './challenge-engine.port';

@Injectable()
export class ChallengeEngine implements IdentityChallengeEnginePort {
  generateCode(format: ChallengeCodeFormat): string {
    if (format === 'ZERO_PADDED') {
      return randomInt(0, 1_000_000).toString().padStart(6, '0');
    }

    const value = Math.floor(100000 + Math.random() * 900000);
    return String(value);
  }

  hashCode(code: string, secretKind: ChallengeSecretKind): string {
    const secret = this.resolveSecret(secretKind);
    return createHmac('sha256', secret).update(code).digest('hex');
  }

  verifyCodeHash(
    code: string,
    codeHash: string,
    secretKind: ChallengeSecretKind,
  ): boolean {
    const computed = this.hashCode(code, secretKind);
    const expected = Buffer.from(codeHash, 'hex');
    const actual = Buffer.from(computed, 'hex');
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  }

  generateVerificationToken(): string {
    return randomBytes(32).toString('hex');
  }

  hashVerificationToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  windowStart(now: Date, windowMs: number): Date {
    return new Date(now.getTime() - windowMs);
  }

  expiresAt(now: Date, ttlMs: number): Date {
    return new Date(now.getTime() + ttlMs);
  }

  limitReached(count: number, limit: number): boolean {
    return count >= limit;
  }

  failedAttemptState(params: {
    attempts: number;
    maxAttempts: number;
    now: Date;
  }): ChallengeFailedAttemptState {
    const attempts = params.attempts + 1;
    if (attempts >= params.maxAttempts) {
      return {
        attempts,
        ...this.revokedState(params.now),
      };
    }

    return {
      attempts,
      status: 'PENDING',
      consumedAt: null,
    };
  }

  revokedState(now: Date): ChallengeLifecycleState {
    return { status: 'REVOKED', consumedAt: now };
  }

  expiredState(now: Date): ChallengeLifecycleState {
    return { status: 'EXPIRED', consumedAt: now };
  }

  consumedState(now: Date): ChallengeLifecycleState {
    return { status: 'CONSUMED', consumedAt: now };
  }

  private resolveSecret(secretKind: ChallengeSecretKind): string {
    const envName =
      secretKind === 'OTP' ? 'OTP_SECRET' : 'PHONE_VERIFICATION_SECRET';
    const secret = process.env[envName];

    if (!secret && process.env.NODE_ENV === 'production') {
      throw new Error(`${envName} is required in production`);
    }

    return secret ?? 'dev-secret';
  }
}

