import { Inject, Injectable } from '@nestjs/common';
import { AuthChallengeStatus, type Prisma } from '@prisma/client';

import {
  IDENTITY_CHALLENGE_ENGINE,
  type IdentityChallengeEnginePort,
} from './challenge-engine.port';
import { PrismaService } from './identity-prisma';

export type OtpChallengePolicyProfile =
  | 'LOGIN_2FA'
  | 'PHONE_ENROLL'
  | 'MEMBERSHIP_LOGIN'
  | 'CHECKOUT'
  | 'EMAIL_VERIFY'
  | 'POS_RECHARGE'
  | 'GENERIC_PHONE';

export type OtpChallengePolicyViolation =
  | 'COOLDOWN'
  | 'HOURLY_LIMIT'
  | 'DAILY_LIMIT'
  | 'IP_HOURLY_LIMIT';

export type OtpChallengePolicyResult =
  | { ok: true }
  | { ok: false; violation: OtpChallengePolicyViolation };

type OtpPolicyScope = 'USER' | 'ADDRESS' | 'IP';

type OtpPolicyRule = {
  scope: OtpPolicyScope;
  windowMs: number;
  limit: number;
  violation: OtpChallengePolicyViolation;
};

type OtpPolicyInput = {
  profile: OtpChallengePolicyProfile;
  purpose: string;
  now: Date;
  userId?: string | null;
  addressNorm?: string | null;
  ip?: string | null;
};

type OtpSupersedeInput = OtpPolicyInput & {
  currentChallengeId: string;
};

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const PUBLIC_IP_HOURLY_LIMIT = 30;

const PROFILE_RULES: Record<
  OtpChallengePolicyProfile,
  readonly OtpPolicyRule[]
> = {
  LOGIN_2FA: [
    { scope: 'USER', windowMs: MINUTE_MS, limit: 1, violation: 'COOLDOWN' },
    {
      scope: 'USER',
      windowMs: HOUR_MS,
      limit: 5,
      violation: 'HOURLY_LIMIT',
    },
  ],
  PHONE_ENROLL: [
    {
      scope: 'ADDRESS',
      windowMs: MINUTE_MS,
      limit: 1,
      violation: 'COOLDOWN',
    },
    {
      scope: 'ADDRESS',
      windowMs: HOUR_MS,
      limit: 5,
      violation: 'HOURLY_LIMIT',
    },
    {
      scope: 'USER',
      windowMs: HOUR_MS,
      limit: 5,
      violation: 'HOURLY_LIMIT',
    },
  ],
  MEMBERSHIP_LOGIN: [
    {
      scope: 'ADDRESS',
      windowMs: MINUTE_MS,
      limit: 1,
      violation: 'COOLDOWN',
    },
    {
      scope: 'ADDRESS',
      windowMs: HOUR_MS,
      limit: 5,
      violation: 'HOURLY_LIMIT',
    },
    {
      scope: 'IP',
      windowMs: HOUR_MS,
      limit: PUBLIC_IP_HOURLY_LIMIT,
      violation: 'IP_HOURLY_LIMIT',
    },
  ],
  CHECKOUT: [
    {
      scope: 'ADDRESS',
      windowMs: MINUTE_MS,
      limit: 1,
      violation: 'COOLDOWN',
    },
    {
      scope: 'ADDRESS',
      windowMs: DAY_MS,
      limit: 5,
      violation: 'DAILY_LIMIT',
    },
    {
      scope: 'IP',
      windowMs: HOUR_MS,
      limit: PUBLIC_IP_HOURLY_LIMIT,
      violation: 'IP_HOURLY_LIMIT',
    },
  ],
  EMAIL_VERIFY: [
    { scope: 'USER', windowMs: MINUTE_MS, limit: 1, violation: 'COOLDOWN' },
    {
      scope: 'USER',
      windowMs: DAY_MS,
      limit: 5,
      violation: 'DAILY_LIMIT',
    },
    {
      scope: 'ADDRESS',
      windowMs: DAY_MS,
      limit: 5,
      violation: 'DAILY_LIMIT',
    },
  ],
  POS_RECHARGE: [
    { scope: 'USER', windowMs: MINUTE_MS, limit: 1, violation: 'COOLDOWN' },
    {
      scope: 'USER',
      windowMs: DAY_MS,
      limit: 5,
      violation: 'DAILY_LIMIT',
    },
  ],
  GENERIC_PHONE: [
    {
      scope: 'ADDRESS',
      windowMs: MINUTE_MS,
      limit: 1,
      violation: 'COOLDOWN',
    },
    {
      scope: 'ADDRESS',
      windowMs: DAY_MS,
      limit: 5,
      violation: 'DAILY_LIMIT',
    },
    {
      scope: 'IP',
      windowMs: HOUR_MS,
      limit: PUBLIC_IP_HOURLY_LIMIT,
      violation: 'IP_HOURLY_LIMIT',
    },
  ],
};

const SUPERSEDE_SCOPE: Record<OtpChallengePolicyProfile, 'USER' | 'ADDRESS'> = {
  LOGIN_2FA: 'USER',
  PHONE_ENROLL: 'USER',
  MEMBERSHIP_LOGIN: 'ADDRESS',
  CHECKOUT: 'ADDRESS',
  EMAIL_VERIFY: 'USER',
  POS_RECHARGE: 'USER',
  GENERIC_PHONE: 'ADDRESS',
};

@Injectable()
export class OtpChallengePolicyService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(IDENTITY_CHALLENGE_ENGINE)
    private readonly challengeEngine: IdentityChallengeEnginePort,
  ) {}

  private scopeWhere(
    input: OtpPolicyInput,
    scope: OtpPolicyScope,
  ): Prisma.AuthChallengeWhereInput | null {
    if (scope === 'USER') {
      if (!input.userId) {
        throw new Error(`OTP policy ${input.profile} requires userId`);
      }
      return { userId: input.userId };
    }
    if (scope === 'ADDRESS') {
      if (!input.addressNorm) {
        throw new Error(`OTP policy ${input.profile} requires addressNorm`);
      }
      return { addressNorm: input.addressNorm };
    }
    if (!input.ip) return null;
    return { ip: input.ip };
  }

  async checkSend(input: OtpPolicyInput): Promise<OtpChallengePolicyResult> {
    for (const rule of PROFILE_RULES[input.profile]) {
      const scopeWhere = this.scopeWhere(input, rule.scope);
      if (!scopeWhere) continue;

      const count = await this.prisma.authChallenge.count({
        where: {
          purpose: input.purpose,
          codeHash: { not: null },
          createdAt: {
            gt: this.challengeEngine.windowStart(input.now, rule.windowMs),
          },
          ...scopeWhere,
        },
      });

      if (this.challengeEngine.limitReached(count, rule.limit)) {
        return { ok: false, violation: rule.violation };
      }
    }

    return { ok: true };
  }

  async revokeSupersededCodes(input: OtpSupersedeInput): Promise<void> {
    const scope = SUPERSEDE_SCOPE[input.profile];
    const scopeWhere = this.scopeWhere(input, scope);
    if (!scopeWhere) return;

    await this.prisma.authChallenge.updateMany({
      where: {
        id: { not: input.currentChallengeId },
        purpose: input.purpose,
        status: AuthChallengeStatus.PENDING,
        codeHash: { not: null },
        ...scopeWhere,
      },
      data: this.challengeEngine.revokedState(input.now),
    });
  }
}
