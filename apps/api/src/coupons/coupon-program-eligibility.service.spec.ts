import { CouponProgramEligibilityService } from './coupon-program-eligibility.service';

describe('CouponProgramEligibilityService', () => {
  const baseProgram = {
    programStableId: 'program_1',
    totalLimit: null,
    perUserLimit: 1,
    issuedCount: 0,
    triggerType: null,
    items: [{ couponStableId: 'cm123456789012345678901234', quantity: 1 }],
  } as never;

  it('rejects a program when its total issuance limit would be exceeded', async () => {
    const prisma = {
      userCoupon: { count: jest.fn() },
    };
    const service = new CouponProgramEligibilityService(prisma as never);

    const result = await service.evaluate(
      { ...baseProgram, totalLimit: 10, issuedCount: 10 } as never,
      'user_1',
    );

    expect(result).toEqual({
      canIssue: false,
      issuedToUser: 0,
      requiredQuantity: 1,
      reason: 'TOTAL_LIMIT_REACHED',
    });
    expect(prisma.userCoupon.count).not.toHaveBeenCalled();
  });

  it('rejects a user who reached the per-user limit', async () => {
    const prisma = {
      userCoupon: { count: jest.fn().mockResolvedValue(1) },
    };
    const service = new CouponProgramEligibilityService(prisma as never);

    const result = await service.evaluate(baseProgram, 'user_1');

    expect(result.canIssue).toBe(false);
    expect(result.reason).toBe('USER_LIMIT_REACHED');
    expect(result.issuedToUser).toBe(1);
  });

  it('allows an eligible user', async () => {
    const prisma = {
      userCoupon: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = new CouponProgramEligibilityService(prisma as never);

    const result = await service.evaluate(baseProgram, 'user_1');

    expect(result).toEqual({
      canIssue: true,
      issuedToUser: 0,
      requiredQuantity: 1,
      reason: 'ELIGIBLE',
    });
  });
});
