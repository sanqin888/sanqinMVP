import { CouponProgramIssuerService } from './coupon-program-issuer.service';

type CreatedCoupon = {
  discountCents: number;
  discountPercent: number | null;
  minSpendCents: number | null;
};

describe('CouponProgramIssuerService', () => {
  const templateStableId = 'cm123456789012345678901234';

  it('materializes percentage coupons without converting them to a fixed amount', async () => {
    let createdCoupons: CreatedCoupon[] = [];
    const tx = {
      coupon: {
        createMany: (input: { data: CreatedCoupon[] }) => {
          createdCoupons = input.data.map((coupon) => ({
            discountCents: coupon.discountCents,
            discountPercent: coupon.discountPercent,
            minSpendCents: coupon.minSpendCents,
          }));
          return Promise.resolve({ count: input.data.length });
        },
      },
      userCoupon: {
        createMany: () => Promise.resolve({ count: 1 }),
      },
      couponProgram: {
        update: () => Promise.resolve({}),
      },
    };
    const prisma = {
      couponTemplate: {
        count: () => Promise.resolve(1),
        findMany: () =>
          Promise.resolve([
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
      $transaction: (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
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

    expect(createdCoupons).toEqual([
      {
        discountCents: 0,
        discountPercent: 10,
        minSpendCents: 2000,
      },
    ]);
  });
});
