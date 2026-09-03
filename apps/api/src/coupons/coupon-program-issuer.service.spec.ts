import {
  couponRuleDiscountCents,
  couponRuleDiscountPercent,
  parseCouponUseRule,
} from './coupon-use-rule';
import { CouponProgramIssuerService } from './coupon-program-issuer.service';

describe('percentage coupon issuance fields', () => {
  it('materializes percentage without a fixed discount amount', () => {
    const rule = parseCouponUseRule({
      type: 'PERCENT',
      applyTo: 'ORDER',
      percentOff: 10,
      constraints: { minSubtotalCents: 2000 },
    });

    expect({
      discountCents: couponRuleDiscountCents(rule),
      discountPercent: couponRuleDiscountPercent(rule),
    }).toEqual({
      discountCents: 0,
      discountPercent: 10,
    });
  });
});

describe('CouponProgramIssuerService admin issuance boundary', () => {
  it('owns ADMIN_PUSH user resolution before issuing entitlements', async () => {
    const program = {
      programStableId: 'program-admin-push',
      distributionType: 'ADMIN_PUSH',
    };
    const user = {
      id: '22222222-2222-4222-8222-222222222222',
      userStableId: 'customer-stable-2',
    };
    const findProgram = jest.fn().mockResolvedValue(program);
    const findUser = jest.fn().mockResolvedValue(user);
    const prisma = {
      couponProgram: { findUnique: findProgram },
      user: { findFirst: findUser },
    };
    const service = new CouponProgramIssuerService(prisma as never);
    const issueProgramToUser = jest
      .spyOn(service, 'issueProgramToUser')
      .mockResolvedValue({ issuedCount: 1 });

    await expect(
      service.issueAdminPushProgram(program.programStableId, {
        userStableId: user.userStableId,
      }),
    ).resolves.toEqual({ issuedCount: 1 });

    expect(findProgram).toHaveBeenCalledWith({
      where: { programStableId: program.programStableId },
    });
    expect(findUser).toHaveBeenCalledWith({
      where: { userStableId: user.userStableId },
    });
    expect(issueProgramToUser).toHaveBeenCalledWith(program, user);
  });
});
