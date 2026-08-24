import { UberMenuAvailabilityPrismaAdapter } from './uber-menu-availability-prisma.adapter';

describe('UberMenuAvailabilityPrismaAdapter', () => {
  it('只把公开且 publishToUberEats 的 SanQ 菜品视为可发布', async () => {
    const findFirst = jest.fn().mockResolvedValue({ stableId: 'item-1' });
    const adapter = new UberMenuAvailabilityPrismaAdapter({
      menuItem: { findFirst },
    } as never);

    await expect(adapter.isMenuItemPublishable('item-1')).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        stableId: 'item-1',
        deletedAt: null,
        visibility: 'PUBLIC',
        publishToUberEats: true,
      },
      select: { stableId: true },
    });
  });

  it('门店筛选同时接受 POS storeId 与 Uber storeId，并返回 canonical POS storeId', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([
        { posExternalStoreId: 'pos-a', uberStoreId: 'uber-a' },
      ]);
    const adapter = new UberMenuAvailabilityPrismaAdapter({
      uberStoreMapping: { findMany },
    } as never);

    await expect(adapter.findProvisionedStores('uber-a')).resolves.toEqual([
      { storeId: 'pos-a', uberStoreId: 'uber-a' },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        isProvisioned: true,
        OR: [{ posExternalStoreId: 'uber-a' }, { uberStoreId: 'uber-a' }],
      },
      select: { posExternalStoreId: true, uberStoreId: true },
    });
  });
});
