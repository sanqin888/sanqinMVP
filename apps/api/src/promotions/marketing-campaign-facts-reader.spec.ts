import { PromotionsService } from './promotions.service';

describe('Marketing campaign facts', () => {
  it('projects Store-scoped Daily Specials and brand campaigns using only stable identities', async () => {
    const prisma = {
      menuDailySpecial: {
        findMany: jest.fn().mockResolvedValue([
          {
            stableId: 'daily-1',
            weekday: 1,
            pricingMode: 'OVERRIDE_PRICE',
            startDate: null,
            endDate: null,
            startMinutes: 660,
            endMinutes: 900,
            isEnabled: true,
            itemStableId: 'item-1',
          },
        ]),
      },
      promotionRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            stableId: 'rule-1',
            titleZh: '买一送一',
            titleEn: 'Buy one get one',
            type: 'BUY_X_GET_Y',
            status: 'ACTIVE',
            validFrom: null,
            validTo: null,
            weekdays: [],
            startMinutes: null,
            endMinutes: null,
          },
        ]),
      },
      couponProgram: {
        findMany: jest.fn().mockResolvedValue([
          {
            programStableId: 'program-1',
            tittleCh: '新人礼包',
            tittleEn: 'Welcome bundle',
            distributionType: 'AUTOMATIC_TRIGGER',
            status: 'ACTIVE',
            validFrom: null,
            validTo: null,
          },
        ]),
      },
      coupon: {
        findMany: jest.fn().mockResolvedValue([
          {
            couponStableId: 'coupon-instance-1',
            campaign: 'program-1',
          },
        ]),
      },
    };
    const service = new PromotionsService(
      prisma as never,
      {} as never,
      {
        readItemSubjects: jest.fn().mockResolvedValue([
          {
            itemStableId: 'item-1',
            storeStableId: 'store-1',
            nameEn: 'Pork Roujiamo',
            nameZh: '腊汁肉夹馍',
          },
        ]),
      } as never,
    );

    await expect(
      service.readCampaigns({ storeStableId: 'store-1' }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activityStableId: 'daily-1',
          kind: 'DAILY_SPECIAL',
          scope: 'STORE',
          storeStableId: 'store-1',
          lifecycleStatus: 'ACTIVE',
        }),
        expect.objectContaining({
          activityStableId: 'rule-1',
          kind: 'PROMOTION_RULE',
          scope: 'BRAND',
          storeStableId: null,
        }),
        expect.objectContaining({
          activityStableId: 'program-1',
          kind: 'COUPON_PROGRAM',
          scope: 'BRAND',
          storeStableId: null,
        }),
      ]),
    );

    await expect(
      service.readCouponProgramAttributions([
        'coupon-instance-1',
        'coupon-instance-1',
        ' ',
      ]),
    ).resolves.toEqual([
      {
        couponStableId: 'coupon-instance-1',
        programStableId: 'program-1',
      },
    ]);
    expect(prisma.coupon.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          couponStableId: { in: ['coupon-instance-1'] },
          campaign: { not: null },
        },
      }),
    );
  });
});
