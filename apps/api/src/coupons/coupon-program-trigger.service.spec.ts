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
});
