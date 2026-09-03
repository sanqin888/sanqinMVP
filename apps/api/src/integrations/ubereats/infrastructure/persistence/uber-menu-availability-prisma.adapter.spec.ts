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

  it('门店筛选保留旧 Uber storeId 兼容，并返回 canonical storeStableId', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([
        { posExternalStoreId: 'pos-a', uberStoreId: 'uber-a' },
      ]);
    const adapter = new UberMenuAvailabilityPrismaAdapter({
      uberStoreMapping: { findMany },
    } as never);

    await expect(adapter.findProvisionedStores('uber-a')).resolves.toEqual([
      { storeStableId: 'pos-a', uberStoreId: 'uber-a' },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        isProvisioned: true,
        OR: [{ posExternalStoreId: 'uber-a' }, { uberStoreId: 'uber-a' }],
      },
      select: { posExternalStoreId: true, uberStoreId: true },
    });
  });

  it('把 availability 同步失败记录为可直接重试的 availability 工单', async () => {
    const create = jest.fn().mockResolvedValue({});
    const adapter = new UberMenuAvailabilityPrismaAdapter({
      uberOpsTicket: { create },
    } as never);

    await adapter.createItemPublishFailure({
      storeStableId: 'store-stable-1',
      uberStoreId: 'uber-store-1',
      menuItemStableId: 'item-stable-1',
      isAvailable: false,
      error: 'upstream unavailable',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        storeId: 'store-stable-1',
        type: 'MENU_ITEM_AVAILABILITY',
        status: 'OPEN',
        priority: 'HIGH',
        title: 'Uber 商品可售状态同步失败：item-stable-1',
        description: '本地状态已保存；请重试 Uber 商品可售状态同步。',
        menuItemStableId: 'item-stable-1',
        lastError: 'upstream unavailable',
        context: {
          isAvailable: false,
        },
      },
    });
  });
});
