import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { MembershipOnboardingService } from './membership-onboarding.service';

const NEW_USER_CREATED_AT = new Date('2026-08-22T17:00:00.000Z');
const LEGACY_USER_CREATED_AT = new Date('2026-08-22T16:00:00.000Z');

function createService(prisma: unknown, issueProgramsForUser = jest.fn()) {
  return {
    service: new MembershipOnboardingService(
      prisma as never,
      { issueProgramsForUser } as never,
    ),
    issueProgramsForUser,
  };
}

describe('MembershipOnboardingService', () => {
  it('finalizes a new member with an email-only referrer relationship', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'new-user-id',
        createdAt: NEW_USER_CREATED_AT,
        phoneVerifiedAt: null,
        referralFinalizedAt: null,
        referredByUserId: null,
      })
      .mockResolvedValueOnce({ id: 'referrer-id' });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const { service } = createService({
      user: { findUnique, updateMany },
    });

    const now = new Date();
    const birthdayYear = now.getUTCFullYear() - 20;

    await expect(
      service.finalize({
        userStableId: 'new-user-stable',
        birthdayYear,
        birthdayMonth: 1,
        referrerEmail: ' REFERRER@EXAMPLE.COM ',
      }),
    ).resolves.toEqual({
      finalized: true,
      hasReferrer: true,
      birthdayYear,
      birthdayMonth: 1,
    });

    expect(findUnique).toHaveBeenNthCalledWith(2, {
      where: { email: 'referrer@example.com' },
      select: { id: true },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'new-user-id',
        createdAt: { gte: new Date('2026-08-22T16:45:00.000Z') },
        referralFinalizedAt: null,
        referredByUserId: null,
      },
      data: {
        birthdayYear,
        birthdayMonth: 1,
        birthdayDay: null,
        referredByUserId: 'referrer-id',
        referralFinalizedAt: expect.any(Date) as unknown as Date,
      },
    });
  });

  it('issues referral-qualified programs after a verified user binds a referrer', async () => {
    const referrer = {
      id: 'referrer-id',
      userStableId: 'referrer-stable',
    };
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'new-user-id',
        createdAt: NEW_USER_CREATED_AT,
        phoneVerifiedAt: new Date('2026-08-22T16:59:00.000Z'),
        referralFinalizedAt: null,
        referredByUserId: null,
      })
      .mockResolvedValueOnce({ id: referrer.id })
      .mockResolvedValueOnce(referrer);
    const issueProgramsForUser = jest
      .fn()
      .mockResolvedValue({ issuedCount: 1 });
    const { service } = createService(
      {
        user: {
          findUnique,
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      },
      issueProgramsForUser,
    );

    await service.finalize({
      userStableId: 'new-user-stable',
      birthdayYear: new Date().getUTCFullYear() - 20,
      birthdayMonth: 1,
      referrerEmail: 'referrer@example.com',
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect(issueProgramsForUser).toHaveBeenCalledWith(
      'REFERRAL_QUALIFIED',
      referrer,
    );
  });

  it('finalizes onboarding when the referrer is intentionally skipped', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const { service } = createService({
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'new-user-id',
          createdAt: NEW_USER_CREATED_AT,
          phoneVerifiedAt: null,
          referralFinalizedAt: null,
          referredByUserId: null,
        }),
        updateMany,
      },
    });
    const birthdayYear = new Date().getUTCFullYear() - 25;

    await expect(
      service.finalize({
        userStableId: 'new-user-stable',
        birthdayYear,
        birthdayMonth: 6,
        referrerEmail: null,
      }),
    ).resolves.toMatchObject({ finalized: true, hasReferrer: false });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'new-user-id',
        createdAt: { gte: new Date('2026-08-22T16:45:00.000Z') },
        referralFinalizedAt: null,
        referredByUserId: null,
      },
      data: {
        birthdayYear,
        birthdayMonth: 6,
        birthdayDay: null,
        referredByUserId: undefined,
        referralFinalizedAt: expect.any(Date) as unknown as Date,
      },
    });
  });

  it('rejects phone numbers as referrer input', async () => {
    const updateMany = jest.fn();
    const { service } = createService({
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'new-user-id',
          createdAt: NEW_USER_CREATED_AT,
          phoneVerifiedAt: null,
          referralFinalizedAt: null,
          referredByUserId: null,
        }),
        updateMany,
      },
    });

    await expect(
      service.finalize({
        userStableId: 'new-user-stable',
        birthdayYear: new Date().getUTCFullYear() - 30,
        birthdayMonth: 1,
        referrerEmail: '+14165551234',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects fractional birth values instead of truncating them', async () => {
    const findUnique = jest.fn();
    const { service } = createService({ user: { findUnique } });

    await expect(
      service.finalize({
        userStableId: 'invalid-birthday',
        birthdayYear: new Date().getUTCFullYear() - 20 + 0.5,
        birthdayMonth: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects members who are not safely confirmed to be at least 13', async () => {
    const findUnique = jest.fn();
    const { service } = createService({ user: { findUnique } });
    const now = new Date();

    await expect(
      service.finalize({
        userStableId: 'minor-user',
        birthdayYear: now.getUTCFullYear() - 12,
        birthdayMonth: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('treats pre-rollout accounts as already finalized', async () => {
    const { service } = createService({
      user: {
        findUnique: jest.fn().mockResolvedValue({
          createdAt: LEGACY_USER_CREATED_AT,
          birthdayYear: null,
          birthdayMonth: null,
          referralFinalizedAt: null,
          referredByUserId: null,
        }),
      },
    });

    await expect(service.getStatus('legacy-user')).resolves.toEqual({
      finalized: true,
      birthdayYear: null,
      birthdayMonth: null,
      hasReferrer: false,
    });
  });

  it('rejects a second finalization attempt atomically', async () => {
    const { service } = createService({
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'new-user-id',
          createdAt: NEW_USER_CREATED_AT,
          phoneVerifiedAt: null,
          referralFinalizedAt: null,
          referredByUserId: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    });

    await expect(
      service.finalize({
        userStableId: 'new-user-stable',
        birthdayYear: new Date().getUTCFullYear() - 30,
        birthdayMonth: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an unknown referrer email without finalizing', async () => {
    const updateMany = jest.fn();
    const { service } = createService({
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'new-user-id',
            createdAt: NEW_USER_CREATED_AT,
            phoneVerifiedAt: null,
            referralFinalizedAt: null,
            referredByUserId: null,
          })
          .mockResolvedValueOnce(null),
        updateMany,
      },
    });

    await expect(
      service.finalize({
        userStableId: 'new-user-stable',
        birthdayYear: new Date().getUTCFullYear() - 30,
        birthdayMonth: 1,
        referrerEmail: 'missing@example.com',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

const membershipRulesBusinessConfig = {
  id: 1,
  storeName: '',
  timezone: 'America/Toronto',
  isTemporarilyClosed: false,
  temporaryCloseReason: null,
  earnPtPerDollar: 0.01,
  redeemDollarPerPoint: 1,
  referralPtPerDollar: 0.01,
  tierMultiplierBronze: 1,
  tierMultiplierSilver: 2,
  tierMultiplierGold: 3,
  tierMultiplierPlatinum: 5,
  tierThresholdSilver: 100_000,
  tierThresholdGold: 1_000_000,
  tierThresholdPlatinum: 3_000_000,
};

describe('membership public rules display', () => {
  it('returns the BrandConfig checkbox selection with the current loyalty rules', async () => {
    const service = new LoyaltyService(
      {
        businessConfig: {
          findUnique: jest
            .fn()
            .mockResolvedValue(membershipRulesBusinessConfig),
        },
        brandConfig: {
          findUnique: jest.fn().mockResolvedValue({
            membershipShowTierThresholds: true,
            membershipShowBaseEarningRate: false,
            membershipShowTierMultipliers: true,
            membershipShowPointRedemptionValue: false,
          }),
        },
      } as never,
      {} as never,
    );

    await expect(service.getMembershipProgramRules()).resolves.toMatchObject({
      display: {
        tierThresholds: true,
        baseEarningRate: false,
        tierMultipliers: true,
        pointRedemptionValue: false,
      },
      tierRules: [
        { tier: 'BRONZE', thresholdCents: 0, multiplier: 1 },
        { tier: 'SILVER', thresholdCents: 100_000, multiplier: 2 },
        { tier: 'GOLD', thresholdCents: 1_000_000, multiplier: 3 },
        { tier: 'PLATINUM', thresholdCents: 3_000_000, multiplier: 5 },
      ],
    });
  });

  it('defaults all membership rule display checkboxes on when BrandConfig is absent', async () => {
    const service = new LoyaltyService(
      {
        businessConfig: {
          findUnique: jest
            .fn()
            .mockResolvedValue(membershipRulesBusinessConfig),
        },
        brandConfig: { findUnique: jest.fn().mockResolvedValue(null) },
      } as never,
      {} as never,
    );

    await expect(service.getMembershipProgramRules()).resolves.toMatchObject({
      display: {
        tierThresholds: true,
        baseEarningRate: true,
        tierMultipliers: true,
        pointRedemptionValue: true,
      },
    });
  });
});
