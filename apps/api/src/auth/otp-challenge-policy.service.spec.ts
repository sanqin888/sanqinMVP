import { AuthChallengeStatus } from '@prisma/client';

import { ChallengeEngine } from './challenge-engine.service';
import { OtpChallengePolicyService } from './otp-challenge-policy.service';

describe('OtpChallengePolicyService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  const createService = () => {
    const prisma = {
      authChallenge: {
        count: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    const challengeEngine = new ChallengeEngine();
    const service = new OtpChallengePolicyService(
      prisma as never,
      challengeEngine,
    );
    return { service, prisma };
  };

  it('shares LOGIN_2FA cooldown and hourly budget by user across channels', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-05T18:00:00.000Z'));
    const { service, prisma } = createService();
    prisma.authChallenge.count.mockResolvedValueOnce(0).mockResolvedValueOnce(5);

    await expect(
      service.checkSend({
        profile: 'LOGIN_2FA',
        purpose: 'LOGIN_2FA',
        now: new Date(),
        userId: 'user-db-id',
        addressNorm: 'member@example.com',
      }),
    ).resolves.toEqual({ ok: false, violation: 'HOURLY_LIMIT' });

    expect(prisma.authChallenge.count).toHaveBeenNthCalledWith(1, {
      where: {
        purpose: 'LOGIN_2FA',
        codeHash: { not: null },
        createdAt: { gt: new Date('2026-09-05T17:59:00.000Z') },
        userId: 'user-db-id',
      },
    });
    expect(prisma.authChallenge.count).toHaveBeenNthCalledWith(2, {
      where: {
        purpose: 'LOGIN_2FA',
        codeHash: { not: null },
        createdAt: { gt: new Date('2026-09-05T17:00:00.000Z') },
        userId: 'user-db-id',
      },
    });
  });

  it('adds a per-user hourly budget to PHONE_ENROLL in addition to target-phone limits', async () => {
    const { service, prisma } = createService();
    const now = new Date('2026-09-05T18:00:00.000Z');
    prisma.authChallenge.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(5);

    await expect(
      service.checkSend({
        profile: 'PHONE_ENROLL',
        purpose: 'PHONE_ENROLL',
        now,
        userId: 'user-db-id',
        addressNorm: '+14165550100',
      }),
    ).resolves.toEqual({ ok: false, violation: 'HOURLY_LIMIT' });

    expect(prisma.authChallenge.count).toHaveBeenNthCalledWith(3, {
      where: {
        purpose: 'PHONE_ENROLL',
        codeHash: { not: null },
        createdAt: { gt: new Date('2026-09-05T17:00:00.000Z') },
        userId: 'user-db-id',
      },
    });
  });

  it('enforces a DB-backed public IP budget for membership login', async () => {
    const { service, prisma } = createService();
    const now = new Date('2026-09-05T18:00:00.000Z');
    prisma.authChallenge.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(30);

    await expect(
      service.checkSend({
        profile: 'MEMBERSHIP_LOGIN',
        purpose: 'membership-login',
        now,
        addressNorm: '+14165550100',
        ip: '203.0.113.10',
      }),
    ).resolves.toEqual({ ok: false, violation: 'IP_HOURLY_LIMIT' });

    expect(prisma.authChallenge.count).toHaveBeenNthCalledWith(3, {
      where: {
        purpose: 'membership-login',
        codeHash: { not: null },
        createdAt: { gt: new Date('2026-09-05T17:00:00.000Z') },
        ip: '203.0.113.10',
      },
    });
  });

  it('keeps CHECKOUT at one minute plus five sends per day per address', async () => {
    const { service, prisma } = createService();
    const now = new Date('2026-09-05T18:00:00.000Z');
    prisma.authChallenge.count.mockResolvedValueOnce(0).mockResolvedValueOnce(5);

    await expect(
      service.checkSend({
        profile: 'CHECKOUT',
        purpose: 'checkout',
        now,
        addressNorm: 'member@example.com',
        ip: '203.0.113.10',
      }),
    ).resolves.toEqual({ ok: false, violation: 'DAILY_LIMIT' });
  });

  it('keeps EMAIL_VERIFY and POS_RECHARGE on five-send daily account budgets', async () => {
    const { service, prisma } = createService();
    const now = new Date('2026-09-05T18:00:00.000Z');

    prisma.authChallenge.count.mockResolvedValueOnce(0).mockResolvedValueOnce(5);
    await expect(
      service.checkSend({
        profile: 'EMAIL_VERIFY',
        purpose: 'email_verify',
        now,
        userId: 'user-db-id',
        addressNorm: 'member@example.com',
      }),
    ).resolves.toEqual({ ok: false, violation: 'DAILY_LIMIT' });

    prisma.authChallenge.count.mockReset();
    prisma.authChallenge.count.mockResolvedValueOnce(0).mockResolvedValueOnce(5);
    await expect(
      service.checkSend({
        profile: 'POS_RECHARGE',
        purpose: 'pos-recharge',
        now,
        userId: 'user-db-id',
        addressNorm: 'member@example.com',
      }),
    ).resolves.toEqual({ ok: false, violation: 'DAILY_LIMIT' });
  });

  it('revokes older pending OTP rows only after a new successful code becomes canonical', async () => {
    const { service, prisma } = createService();
    const now = new Date('2026-09-05T18:00:00.000Z');
    prisma.authChallenge.updateMany.mockResolvedValue({ count: 1 });

    await service.revokeSupersededCodes({
      profile: 'CHECKOUT',
      purpose: 'checkout',
      now,
      addressNorm: 'member@example.com',
      currentChallengeId: 'current-code',
    });

    expect(prisma.authChallenge.updateMany).toHaveBeenCalledWith({
      where: {
        id: { not: 'current-code' },
        purpose: 'checkout',
        status: AuthChallengeStatus.PENDING,
        codeHash: { not: null },
        addressNorm: 'member@example.com',
      },
      data: {
        status: AuthChallengeStatus.REVOKED,
        consumedAt: now,
      },
    });
  });
});
