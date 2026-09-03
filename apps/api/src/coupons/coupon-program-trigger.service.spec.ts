import { CouponProgramTriggerService } from './coupon-program-trigger.service';

describe('CouponProgramTriggerService public boundary', () => {
  it('resolves the user by stableId before evaluating trigger programs', async () => {
    const user = {
      id: '11111111-1111-4111-8111-111111111111',
      userStableId: 'customer-stable-1',
    };
    const findUnique = jest.fn().mockResolvedValue(user);
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      user: { findUnique },
      couponProgram: { findMany },
    };
    const service = new CouponProgramTriggerService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.issueProgramsForUser('SIGNUP_COMPLETED', user.userStableId),
    ).resolves.toEqual({ issuedCount: 0 });

    expect(findUnique).toHaveBeenCalledWith({
      where: { userStableId: user.userStableId },
    });
    expect(findMany).toHaveBeenCalled();
  });

  it('requests coupon-issued messaging through the public port with an explicit snapshot', async () => {
    const user = {
      id: '11111111-1111-4111-8111-111111111111',
      userStableId: 'customer-stable-1',
      email: 'john@example.com',
      firstName: 'John',
      lastName: 'Doe',
      language: 'EN',
    };
    const program = {
      programStableId: 'welcome-program',
      tittleCh: '新人礼包',
      tittleEn: 'Welcome Gift',
      giftValue: '50',
      triggerType: 'SIGNUP_COMPLETED',
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      couponProgram: { findMany: jest.fn().mockResolvedValue([program]) },
      coupon: {
        findMany: jest.fn().mockResolvedValue([{ expiresAt: null }]),
      },
    };
    const issuer = {
      issueProgramToUser: jest.fn().mockResolvedValue({ issuedCount: 1 }),
    };
    const eligibility = {
      evaluate: jest.fn().mockResolvedValue({ canIssue: true }),
    };
    const couponIssuedNotification = {
      notifyCouponIssued: jest
        .fn()
        .mockResolvedValue({ ok: true, sendId: 'send-1' }),
    };
    const service = new CouponProgramTriggerService(
      prisma as never,
      issuer as never,
      eligibility as never,
      couponIssuedNotification as never,
    );

    await expect(
      service.issueProgramsForUser('SIGNUP_COMPLETED', user.userStableId),
    ).resolves.toEqual({ issuedCount: 1 });
    await Promise.resolve();

    expect(couponIssuedNotification.notifyCouponIssued).toHaveBeenCalledWith({
      recipient: {
        userStableId: user.userStableId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        language: user.language,
      },
      program: {
        titleZh: program.tittleCh,
        titleEn: program.tittleEn,
        programStableId: program.programStableId,
        giftValue: program.giftValue,
        reason: program.triggerType,
      },
    });
  });
});
