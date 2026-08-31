import { BadRequestException } from '@nestjs/common';
import { UserLanguage } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { LoyaltyService } from '../loyalty/loyalty.service';
import type { CouponProgramTriggerService } from '../coupons/coupon-program-trigger.service';
import type { EmailVerificationService } from '../email/email-verification.service';
import type { NotificationService } from '../notifications/notification.service';
import { MembershipService } from './membership.service';

describe('MembershipService profile birthday', () => {
  const createService = () => {
    const findUnique = jest.fn();
    const update = jest.fn();
    const prisma = {
      user: {
        findUnique,
        update,
      },
    } as unknown as PrismaService;

    const service = new MembershipService(
      prisma,
      {} as unknown as LoyaltyService,
      {} as unknown as CouponProgramTriggerService,
      {} as unknown as EmailVerificationService,
      {} as unknown as NotificationService,
    );

    return { service, findUnique, update };
  };

  it('allows a legacy month-only member to confirm year and month once', async () => {
    const { service, findUnique, update } = createService();
    findUnique.mockResolvedValue({
      userStableId: 'member-legacy',
      firstName: 'Legacy',
      lastName: 'Member',
      birthdayYear: null,
      birthdayMonth: 5,
      language: UserLanguage.ZH,
    });
    update.mockResolvedValue({
      firstName: 'Legacy',
      lastName: 'Member',
      birthdayYear: 1990,
      birthdayMonth: 6,
      language: UserLanguage.ZH,
    });

    await expect(
      service.updateProfile({
        userStableId: 'member-legacy',
        birthdayYear: 1990,
        birthdayMonth: 6,
      }),
    ).resolves.toMatchObject({
      birthdayYear: 1990,
      birthdayMonth: 6,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userStableId: 'member-legacy' },
        data: expect.objectContaining({
          birthdayYear: 1990,
          birthdayMonth: 6,
        }),
      }),
    );
  });

  it('keeps a complete year-month birthday locked', async () => {
    const { service, findUnique, update } = createService();
    findUnique.mockResolvedValue({
      userStableId: 'member-complete',
      firstName: 'Complete',
      lastName: 'Member',
      birthdayYear: 1990,
      birthdayMonth: 5,
      language: UserLanguage.EN,
    });

    await expect(
      service.updateProfile({
        userStableId: 'member-complete',
        birthdayYear: 1991,
        birthdayMonth: 6,
      }),
    ).resolves.toMatchObject({
      birthdayYear: 1990,
      birthdayMonth: 5,
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('keeps the minimum-age rule when a legacy member confirms birthday', async () => {
    const { service, findUnique, update } = createService();
    const now = new Date();
    findUnique.mockResolvedValue({
      userStableId: 'member-minor',
      firstName: 'Minor',
      lastName: 'Member',
      birthdayYear: null,
      birthdayMonth: 5,
      language: UserLanguage.EN,
    });

    await expect(
      service.updateProfile({
        userStableId: 'member-minor',
        birthdayYear: now.getUTCFullYear() - 12,
        birthdayMonth: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(update).not.toHaveBeenCalled();
  });
});
