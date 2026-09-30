import { PublicMenuService } from './public-menu.service';

describe('PublicMenuService daily-special boundary', () => {
  it('reads active daily specials through the Offers capability instead of Prisma', async () => {
    const categoryFindMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      menuCategory: { findMany: categoryFindMany },
    };
    const dailySpecialOffers = {
      getActiveDailySpecials: jest.fn().mockResolvedValue({ specials: [] }),
    };
    const service = new PublicMenuService(
      prisma as never,
      dailySpecialOffers as never,
    );

    await expect(service.getPublicMenu('store-1')).resolves.toEqual({
      categories: [],
      dailySpecials: [],
    });

    expect(categoryFindMany).toHaveBeenCalledTimes(1);
    expect(dailySpecialOffers.getActiveDailySpecials).toHaveBeenCalledWith(
      'store-1',
      [],
    );
    expect('menuDailySpecial' in prisma).toBe(false);
  });
});
