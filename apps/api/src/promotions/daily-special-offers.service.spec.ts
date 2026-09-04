import { PromotionsService } from './promotions.service';

const baseSpecial = {
  stableId: 'special-1',
  weekday: 1,
  itemStableId: 'item-1',
  pricingMode: 'OVERRIDE_PRICE' as const,
  overridePriceCents: 799,
  discountDeltaCents: null,
  discountPercent: null,
  startDate: null,
  endDate: null,
  startMinutes: null,
  endMinutes: null,
  disallowCoupons: true,
  isEnabled: true,
  sortOrder: 0,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
};

describe('PromotionsService Daily Special Offers ownership boundary', () => {
  it('loads all seven weekdays and combines Offers definitions with Catalog base-price facts', async () => {
    const findMany = jest.fn().mockResolvedValue([baseSpecial]);
    const service = new PromotionsService(
      { menuDailySpecial: { findMany } } as never,
      {} as never,
    );

    await expect(
      service.getDailySpecials(undefined, [
        { itemStableId: 'item-1', basePriceCents: 1099 },
      ]),
    ).resolves.toEqual({
      specials: [
        expect.objectContaining({
          stableId: 'special-1',
          itemStableId: 'item-1',
          basePriceCents: 1099,
          effectivePriceCents: 799,
        }),
      ],
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          weekday: { in: [1, 2, 3, 4, 5, 6, 7] },
        },
      }),
    );
  });

  it.each([6, 7])('accepts weekend weekday %i', async (weekday) => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new PromotionsService(
      { menuDailySpecial: { findMany } } as never,
      {} as never,
    );

    await expect(service.getDailySpecials(weekday, [])).resolves.toEqual({
      specials: [],
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null, weekday } }),
    );
  });

  it('owns store-time activation without reading Catalog persistence', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-31T04:30:00.000Z'));
    const findMany = jest.fn().mockResolvedValue([
      { ...baseSpecial, weekday: 7 },
    ]);
    const prisma = { menuDailySpecial: { findMany } };
    const brandStoreConfigReader = {
      getConfiguredStoreSnapshot: jest.fn().mockResolvedValue({
        timezone: 'Pacific/Honolulu',
      }),
    };
    const service = new PromotionsService(
      prisma as never,
      brandStoreConfigReader as never,
    );

    try {
      await expect(
        service.getActiveDailySpecials([
          { itemStableId: 'item-1', basePriceCents: 1099 },
        ]),
      ).resolves.toEqual({
        specials: [
          expect.objectContaining({
            stableId: 'special-1',
            weekday: 7,
            effectivePriceCents: 799,
          }),
        ],
      });
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { weekday: 7, isEnabled: true, deletedAt: null },
        }),
      );
      expect('menuItem' in prisma).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('validates Catalog item facts before writing Offers persistence', async () => {
    const transaction = jest.fn();
    const service = new PromotionsService(
      { $transaction: transaction } as never,
      {} as never,
    );

    await expect(
      service.upsertDailySpecials(
        {
          specials: [
            {
              weekday: 1,
              itemStableId: 'missing-item',
              pricingMode: 'OVERRIDE_PRICE',
              overridePriceCents: 799,
            },
          ],
        },
        [],
      ),
    ).rejects.toThrow('Menu item not found: missing-item');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('keeps the existing transactional soft-delete/create write semantics inside Offers', async () => {
    const create = jest.fn().mockResolvedValue({});
    const update = jest.fn().mockResolvedValue({});
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      menuDailySpecial: {
        findMany: jest.fn().mockResolvedValue([
          { stableId: 'old-special', weekday: 1, itemStableId: 'item-old' },
        ]),
        create,
        update,
        updateMany,
      },
    };
    const transaction = jest
      .fn()
      .mockImplementation(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      );
    const service = new PromotionsService(
      { $transaction: transaction } as never,
      {} as never,
    );

    await service.upsertDailySpecials(
      {
        specials: [
          {
            stableId: 'new-special',
            weekday: 1,
            itemStableId: 'item-1',
            pricingMode: 'OVERRIDE_PRICE',
            overridePriceCents: 799,
            disallowCoupons: true,
            isEnabled: true,
            sortOrder: 2,
          },
        ],
      },
      [{ itemStableId: 'item-1', basePriceCents: 1099 }],
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: { stableId: { in: ['old-special'] } },
      data: { deletedAt: expect.any(Date) },
    });
    expect(update).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stableId: 'new-special',
        weekday: 1,
        itemStableId: 'item-1',
        pricingMode: 'OVERRIDE_PRICE',
        overridePriceCents: 799,
        disallowCoupons: true,
        isEnabled: true,
        sortOrder: 2,
        deletedAt: null,
      }),
    });
  });
});
