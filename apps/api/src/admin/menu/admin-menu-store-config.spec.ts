import { AdminMenuService } from './admin-menu.service';

describe('AdminMenuService canonical store timezone', () => {
  it('loads the admin menu from StoreConfig without creating BusinessConfig', async () => {
    const prisma = {
      menuDailySpecial: { findMany: jest.fn().mockResolvedValue([]) },
      menuCategory: { findMany: jest.fn().mockResolvedValue([]) },
      menuOptionGroupTemplate: { findMany: jest.fn().mockResolvedValue([]) },
      menuPackagingType: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const brandStoreConfigReader = {
      getConfiguredStoreSnapshot: jest.fn().mockResolvedValue({
        timezone: 'America/Toronto',
      }),
    };
    const service = new AdminMenuService(
      prisma as never,
      {} as never,
      brandStoreConfigReader as never,
    );

    await service.getFullMenu();

    expect(
      brandStoreConfigReader.getConfiguredStoreSnapshot,
    ).toHaveBeenCalledTimes(1);
    expect(prisma.menuDailySpecial.findMany).toHaveBeenCalledTimes(1);
    expect('businessConfig' in prisma).toBe(false);
  });
});
