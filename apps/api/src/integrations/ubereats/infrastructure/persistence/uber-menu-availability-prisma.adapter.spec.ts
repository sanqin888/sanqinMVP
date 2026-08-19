import { UberMenuAvailabilityPrismaAdapter } from './uber-menu-availability-prisma.adapter';

describe('UberMenuAvailabilityPrismaAdapter', () => {
  it('availability 创建 canonical item 行时继承 legacy Uber 价格覆盖', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const findMany = jest.fn().mockResolvedValue([
      {
        storeId: 'uber-a',
        priceCents: 1229,
        displayName: 'Uber Pork',
        displayDescription: 'Uber description',
      },
    ]);
    const adapter = new UberMenuAvailabilityPrismaAdapter({
      uberItemChannelConfig: { findMany, upsert },
    } as never);

    await adapter.setItemAvailability('pos-a', 'uber-a', 'item-1', false);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        menuItemStableId: 'item-1',
        storeId: { in: ['uber-a', 'default'] },
      },
      select: {
        storeId: true,
        priceCents: true,
        displayName: true,
        displayDescription: true,
      },
    });
    expect(upsert).toHaveBeenCalledWith({
      where: {
        storeId_menuItemStableId: {
          storeId: 'pos-a',
          menuItemStableId: 'item-1',
        },
      },
      create: {
        storeId: 'pos-a',
        uberStoreId: 'uber-a',
        menuItemStableId: 'item-1',
        priceCents: 1229,
        displayName: 'Uber Pork',
        displayDescription: 'Uber description',
        isAvailable: false,
      },
      update: { uberStoreId: 'uber-a', isAvailable: false },
    });
  });

  it('availability 创建 option 行时继承 legacy 价格，不再落到默认 0', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const findMany = jest.fn().mockResolvedValue([
      {
        storeId: 'default',
        priceDeltaCents: 260,
        displayName: 'Extra meat',
        displayDescription: null,
      },
    ]);
    const adapter = new UberMenuAvailabilityPrismaAdapter({
      uberOptionItemConfig: { findMany, upsert },
      menuOptionTemplateChoice: {
        findUnique: jest.fn().mockResolvedValue({ priceDeltaCents: 200 }),
      },
    } as never);

    await adapter.setOptionAvailability(
      'pos-a',
      'uber-a',
      'option-1',
      true,
    );

    expect(upsert).toHaveBeenCalledWith({
      where: {
        storeId_optionChoiceStableId: {
          storeId: 'pos-a',
          optionChoiceStableId: 'option-1',
        },
      },
      create: {
        storeId: 'pos-a',
        uberStoreId: 'uber-a',
        optionChoiceStableId: 'option-1',
        priceDeltaCents: 260,
        displayName: 'Extra meat',
        displayDescription: null,
        isAvailable: true,
      },
      update: { uberStoreId: 'uber-a', isAvailable: true },
    });
  });

  it('option 没有 legacy override 时使用 SanQ 当前选项价，而不是 0', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const adapter = new UberMenuAvailabilityPrismaAdapter({
      uberOptionItemConfig: { findMany: jest.fn().mockResolvedValue([]), upsert },
      menuOptionTemplateChoice: {
        findUnique: jest.fn().mockResolvedValue({ priceDeltaCents: 250 }),
      },
    } as never);

    await adapter.setOptionAvailability(
      'pos-a',
      'uber-a',
      'option-1',
      false,
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ priceDeltaCents: 250 }),
      }),
    );
  });

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
