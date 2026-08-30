export const IDENTITY_CHALLENGE_ENGINE = Symbol('IDENTITY_CHALLENGE_ENGINE');

export type ChallengeCodeFormat = 'ZERO_PADDED' | 'NON_ZERO_SIX_DIGIT';
export type ChallengeSecretKind = 'OTP' | 'PHONE_VERIFICATION';

export type ChallengeLifecycleState = {
  status: 'PENDING' | 'REVOKED' | 'EXPIRED' | 'CONSUMED';
  consumedAt: Date | null;
};

export type ChallengeFailedAttemptState = ChallengeLifecycleState & {
  attempts: number;
};

export interface IdentityChallengeEnginePort {
  generateCode(format: ChallengeCodeFormat): string;
  hashCode(code: string, secretKind: ChallengeSecretKind): string;
  verifyCodeHash(
    code: string,
    codeHash: string,
    secretKind: ChallengeSecretKind,
  ): boolean;
  generateVerificationToken(): string;
  hashVerificationToken(token: string): string;
  windowStart(now: Date, windowMs: number): Date;
  expiresAt(now: Date, ttlMs: number): Date;
  limitReached(count: number, limit: number): boolean;
  failedAttemptState(params: {
    attempts: number;
    maxAttempts: number;
    now: Date;
  }): ChallengeFailedAttemptState;
  revokedState(now: Date): ChallengeLifecycleState;
  expiredState(now: Date): ChallengeLifecycleState;
  consumedState(now: Date): ChallengeLifecycleState;
}

