import { CouponProgramIssuerService } from './coupon-program-issuer.service';

describe('CouponProgramIssuerService', () => {
  const templateStableId = 'cm123456789012345678901234';

  it('materializes percentage coupons without converting them to a fixed amount', async () => {
    const tx = {
      coupon: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      userCoupon: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      couponProgram: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      couponTemplate: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'template-id',
            couponStableId: templateStableId,
            tittleCh: '九折券',
            titleEn: '10% off',
            stackingPolicy: 'EXCLUSIVE',
            validFrom: null,
            validTo: null,
            issueRule: null,
            useRule: {
              type: 'PERCENT',
              applyTo: 'ORDER',
              percentOff: 10,
              constraints: { minSubtotalCents: 2000 },
            },
          },
        ]),
      },
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const service = new CouponProgramIssuerService(prisma as never);

    await expect(
      service.issueProgramToUser(
        {
          programStableId: 'program-1',
          tittleCh: '活动',
          tittleEn: 'Promotion',
          validFrom: null,
          validTo: null,
          items: [{ couponStableId: templateStableId, quantity: 1 }],
        } as never,
        {
          id: 'user-id',
          userStableId: 'user-stable-id',
        } as never,
      ),
    ).resolves.toEqual({ issuedCount: 1 });

    expect(tx.coupon.createMany).toHaveBeenCalledTimes(1);
    const createCall = tx.coupon.createMany.mock.calls[0]?.[0] as {
      data: Array<{
        discountCents: number;
        discountPercent: number | null;
        minSpendCents: number | null;
      }>;
    };
    expect(createCall.data).toHaveLength(1);
    expect(createCall.data[0]).toMatchObject({
      discountCents: 0,
      discountPercent: 10,
      minSpendCents: 2000,
    });
  });
});
