import { CouponProgramClaimService } from './coupon-program-claim.service';

describe('CouponProgramClaimService', () => {
  const user = {
    id: 'user-id',
    userStableId: 'user-stable-id',
    status: 'ACTIVE',
  };
  const program = {
    programStableId: 'program-stable-id',
    tittleCh: '测试活动',
    tittleEn: 'Test promotion',
    status: 'ACTIVE',
    distributionType: 'PROMO_CODE',
    validFrom: null,
    validTo: null,
  };

  it('normalizes promo codes and issues through the existing issuer', async () => {
    const tx = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      couponProgram: { findUnique: jest.fn().mockResolvedValue(program) },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const issuer = {
      issueProgramToUser: jest.fn().mockResolvedValue({ issuedCount: 1 }),
    };
    const eligibility = {
      evaluate: jest.fn().mockResolvedValue({
        canIssue: true,
        issuedToUser: 0,
        requiredQuantity: 1,
        reason: 'ELIGIBLE',
      }),
    };
    const service = new CouponProgramClaimService(
      prisma as never,
      issuer as never,
      eligibility as never,
    );

    const result = await service.claimPromoCode('user-stable-id', ' sanq10 ');

    expect(tx.couponProgram.findUnique).toHaveBeenCalledWith({
      where: { promoCode: 'SANQ10' },
    });
    expect(issuer.issueProgramToUser).toHaveBeenCalledWith(program, user, {
      tx,
    });
    expect(result).toEqual({
      programStableId: 'program-stable-id',
      titleZh: '测试活动',
      titleEn: 'Test promotion',
      issuedCount: 1,
    });
  });

  it('rejects a user who already reached the claim limit', async () => {
    const manualProgram = {
      ...program,
      distributionType: 'MANUAL_CLAIM',
    };
    const tx = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      couponProgram: { findUnique: jest.fn().mockResolvedValue(manualProgram) },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const issuer = { issueProgramToUser: jest.fn() };
    const eligibility = {
      evaluate: jest.fn().mockResolvedValue({
        canIssue: false,
        issuedToUser: 1,
        requiredQuantity: 1,
        reason: 'USER_LIMIT_REACHED',
      }),
    };
    const service = new CouponProgramClaimService(
      prisma as never,
      issuer as never,
      eligibility as never,
    );

    await expect(
      service.claimManual('user-stable-id', 'program-stable-id'),
    ).rejects.toThrow('promotion claim limit reached');
    expect(issuer.issueProgramToUser).not.toHaveBeenCalled();
  });
});
