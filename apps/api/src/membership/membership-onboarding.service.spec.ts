import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { MembershipOnboardingService } from './membership-onboarding.service';

const NEW_USER_CREATED_AT = new Date('2026-08-22T17:00:00.000Z');
const LEGACY_USER_CREATED_AT = new Date('2026-08-22T16:00:00.000Z');

describe('MembershipOnboardingService', () => {
  it('finalizes a new member with an email-only referrer relationship', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'new-user-id',
        createdAt: NEW_USER_CREATED_AT,
        referralFinalizedAt: null,
        referredByUserId: null,
      })
      .mockResolvedValueOnce({ id: 'referrer-id' });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = new MembershipOnboardingService({
      user: { findUnique, updateMany },
    } as never);

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
        referralFinalizedAt: expect.any(Date),
      },
    });
  });

  it('finalizes onboarding when the referrer is intentionally skipped', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = new MembershipOnboardingService({
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'new-user-id',
          createdAt: NEW_USER_CREATED_AT,
          referralFinalizedAt: null,
          referredByUserId: null,
        }),
        updateMany,
      },
    } as never);
    const birthdayYear = new Date().getUTCFullYear() - 25;

    await expect(
      service.finalize({
        userStableId: 'new-user-stable',
        birthdayYear,
        birthdayMonth: 6,
        referrerEmail: null,
      }),
    ).resolves.toMatchObject({ finalized: true, hasReferrer: false });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          referredByUserId: undefined,
          referralFinalizedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('rejects phone numbers as referrer input', async () => {
    const updateMany = jest.fn();
    const service = new MembershipOnboardingService({
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'new-user-id',
          createdAt: NEW_USER_CREATED_AT,
          referralFinalizedAt: null,
          referredByUserId: null,
        }),
        updateMany,
      },
    } as never);

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

  it('rejects members who are not safely confirmed to be at least 13', async () => {
    const findUnique = jest.fn();
    const service = new MembershipOnboardingService({
      user: { findUnique },
    } as never);
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
    const service = new MembershipOnboardingService({
      user: {
        findUnique: jest.fn().mockResolvedValue({
          createdAt: LEGACY_USER_CREATED_AT,
          birthdayYear: null,
          birthdayMonth: null,
          referralFinalizedAt: null,
          referredByUserId: null,
        }),
      },
    } as never);

    await expect(service.getStatus('legacy-user')).resolves.toEqual({
      finalized: true,
      birthdayYear: null,
      birthdayMonth: null,
      hasReferrer: false,
    });
  });

  it('rejects a second finalization attempt atomically', async () => {
    const service = new MembershipOnboardingService({
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'new-user-id',
          createdAt: NEW_USER_CREATED_AT,
          referralFinalizedAt: null,
          referredByUserId: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    } as never);

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
    const service = new MembershipOnboardingService({
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'new-user-id',
            createdAt: NEW_USER_CREATED_AT,
            referralFinalizedAt: null,
            referredByUserId: null,
          })
          .mockResolvedValueOnce(null),
        updateMany,
      },
    } as never);

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
