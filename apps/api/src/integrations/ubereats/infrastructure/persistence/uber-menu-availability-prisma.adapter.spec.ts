import { UberMenuAvailabilityPrismaAdapter } from './uber-menu-availability-prisma.adapter';

describe('UberMenuAvailabilityPrismaAdapter', () => {
  it('filters provisioned stores by canonical storeStableId only', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([
        { posExternalStoreId: 'pos-a', uberStoreId: 'uber-a' },
      ]);
    const adapter = new UberMenuAvailabilityPrismaAdapter({
      uberStoreMapping: { findMany },
    } as never);

    await expect(adapter.findProvisionedStores('pos-a')).resolves.toEqual([
      { storeStableId: 'pos-a', uberStoreId: 'uber-a' },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        isProvisioned: true,
        posExternalStoreId: 'pos-a',
      },
      select: { posExternalStoreId: true, uberStoreId: true },
    });
  });

  it('omits provisioned mappings that lack a canonical storeStableId', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { posExternalStoreId: null, uberStoreId: 'uber-unmapped' },
      { posExternalStoreId: 'pos-a', uberStoreId: 'uber-a' },
    ]);
    const adapter = new UberMenuAvailabilityPrismaAdapter({
      uberStoreMapping: { findMany },
    } as never);

    await expect(adapter.findProvisionedStores()).resolves.toEqual([
      { storeStableId: 'pos-a', uberStoreId: 'uber-a' },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        isProvisioned: true,
        posExternalStoreId: { not: null },
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
      publishable: true,
      suspendUntil: new Date('2090-01-02T03:04:05.000Z'),
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
          publishable: true,
          suspendUntil: '2090-01-02T03:04:05.000Z',
        },
      },
    });
  });
});
