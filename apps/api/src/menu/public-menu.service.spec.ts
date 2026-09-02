import { PublicMenuService } from './public-menu.service';

describe('PublicMenuService canonical store timezone', () => {
  it('reads the menu day from StoreConfig without creating BusinessConfig', async () => {
    const dailySpecialFindMany = jest.fn().mockResolvedValue([]);
    const categoryFindMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      menuDailySpecial: { findMany: dailySpecialFindMany },
      menuCategory: { findMany: categoryFindMany },
    };
    const brandStoreConfigReader = {
      getConfiguredStoreSnapshot: jest.fn().mockResolvedValue({
        timezone: 'America/Toronto',
      }),
    };
    const service = new PublicMenuService(
      prisma as never,
      brandStoreConfigReader as never,
    );

    await expect(service.getPublicMenu()).resolves.toEqual({
      categories: [],
      dailySpecials: [],
    });

    expect(
      brandStoreConfigReader.getConfiguredStoreSnapshot,
    ).toHaveBeenCalledTimes(1);
    expect(dailySpecialFindMany).toHaveBeenCalledTimes(1);
    expect(categoryFindMany).toHaveBeenCalledTimes(1);
    expect('businessConfig' in prisma).toBe(false);
  });
});
