import { UberMenuSnapshotPrismaAdapter } from './uber-menu-snapshot-prisma.adapter';

type SnapshotRows = {
  categories?: unknown[];
  menuItems?: unknown[];
  templates?: unknown[];
  itemConfigs?: unknown[];
  optionConfigs?: unknown[];
  groupConfigs?: unknown[];
  categoryConfigs?: unknown[];
  restoreEvents?: unknown[];
};

describe('UberMenuSnapshotPrismaAdapter publish configuration', () => {
  const setup = (
    businessConfig: {
      timezone: string | null;
      salesTaxRate: number | null;
    },
    rows: SnapshotRows = {},
  ) => {
    const prisma = {
      uberStoreMapping: {
        findFirst: jest.fn().mockResolvedValue({ uberStoreId: 'uber-store' }),
      },
      businessConfig: {
        findUnique: jest.fn().mockResolvedValue(businessConfig),
      },
      menuCategory: {
        findMany: jest.fn().mockResolvedValue(rows.categories ?? []),
      },
      menuItem: {
        findMany: jest.fn().mockResolvedValue(rows.menuItems ?? []),
      },
      menuOptionGroupTemplate: {
        findMany: jest.fn().mockResolvedValue(rows.templates ?? []),
      },
      uberItemChannelConfig: {
        findMany: jest.fn().mockResolvedValue(rows.itemConfigs ?? []),
      },
      uberOptionItemConfig: {
        findMany: jest.fn().mockResolvedValue(rows.optionConfigs ?? []),
      },
      uberModifierGroupConfig: {
        findMany: jest.fn().mockResolvedValue(rows.groupConfigs ?? []),
      },
      uberCategoryConfig: {
        findMany: jest.fn().mockResolvedValue(rows.categoryConfigs ?? []),
      },
      opsEvent: {
        findMany: jest.fn().mockResolvedValue(rows.restoreEvents ?? []),
      },
    };
    return {
      prisma,
      adapter: new UberMenuSnapshotPrismaAdapter(prisma as never),
    };
  };

  const bilingualRows: SnapshotRows = {
    categories: [
      {
        id: 'category-db-id',
        stableId: 'category-stable',
        nameEn: 'Dry Noodles',
        nameZh: '拌面',
      },
    ],
    menuItems: [
      {
        stableId: 'item-stable',
        categoryId: 'category-db-id',
        nameEn: 'Tomato Fried Egg Noodles',
        nameZh: '番茄鸡蛋面',
        basePriceCents: 1099,
        isAvailable: true,
        tempUnavailableUntil: null,
        imageUrl: null,
        ingredientsEn: null,
        optionGroups: [{ templateGroup: { stableId: 'group-stable' } }],
      },
    ],
    templates: [
      {
        stableId: 'group-stable',
        nameEn: 'Size',
        nameZh: '份量',
        defaultMinSelect: 0,
        defaultMaxSelect: 1,
        options: [
          {
            stableId: 'option-stable',
            nameEn: 'Large',
            nameZh: '大份',
            priceDeltaCents: 200,
            isAvailable: true,
            tempUnavailableUntil: null,
          },
        ],
      },
    ],
  };

  it('loads timezone and converts BusinessConfig.salesTaxRate to Uber percentage', async () => {
    const x = setup({ timezone: ' America/Toronto ', salesTaxRate: 0.13 });

    const snapshot = await x.adapter.loadPublishSnapshot(
      'pos-store',
      'uber-store',
    );

    expect(x.prisma.businessConfig.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: { timezone: true, salesTaxRate: true },
    });
    expect(snapshot).toMatchObject({
      timezone: 'America/Toronto',
      taxRate: 13,
    });
  });

  it('uses bilingual SanQ names for auto-mapped publish nodes', async () => {
    const x = setup(
      { timezone: 'America/Toronto', salesTaxRate: 0.13 },
      bilingualRows,
    );

    const snapshot = await x.adapter.loadPublishSnapshot(
      'pos-store',
      'uber-store',
    );

    expect(snapshot?.categories[0]?.name).toBe('Dry Noodles 拌面');
    expect(snapshot?.items[0]?.name).toBe(
      'Tomato Fried Egg Noodles 番茄鸡蛋面',
    );
    expect(snapshot?.modifierGroups[0]?.name).toBe('Size 份量');
    expect(snapshot?.modifierOptions[0]?.name).toBe('Large 大份');
  });

  it('preserves temporary sold-out expiry in the full publish snapshot', async () => {
    const suspendUntil = new Date('2090-01-02T03:04:05.000Z');
    const x = setup(
      { timezone: 'America/Toronto', salesTaxRate: 0.13 },
      {
        ...bilingualRows,
        menuItems: bilingualRows.menuItems?.map((item) => ({
          ...(item as Record<string, unknown>),
          tempUnavailableUntil: suspendUntil,
        })),
        templates: bilingualRows.templates?.map((template) => ({
          ...(template as Record<string, unknown>),
          options: ((template as { options?: unknown[] }).options ?? []).map(
            (option) => ({
              ...(option as Record<string, unknown>),
              tempUnavailableUntil: suspendUntil,
            }),
          ),
        })),
      },
    );

    const snapshot = await x.adapter.loadPublishSnapshot(
      'pos-store',
      'uber-store',
    );
    const expectedEpoch = Math.floor(suspendUntil.getTime() / 1_000);

    expect(snapshot?.items[0]).toMatchObject({
      isAvailable: false,
      suspendUntilEpochSeconds: expectedEpoch,
    });
    expect(snapshot?.modifierOptions[0]).toMatchObject({
      isAvailable: false,
      suspendUntilEpochSeconds: expectedEpoch,
    });
  });

  it('keeps explicit Uber display-name overrides ahead of bilingual fallbacks', async () => {
    const x = setup(
      { timezone: 'America/Toronto', salesTaxRate: 0.13 },
      {
        ...bilingualRows,
        itemConfigs: [
          {
            storeId: 'pos-store',
            menuItemStableId: 'item-stable',
            priceCents: null,
            isAvailable: true,
            displayName: 'Uber Item Override',
            displayDescription: null,
          },
        ],
        optionConfigs: [
          {
            storeId: 'pos-store',
            optionChoiceStableId: 'option-stable',
            priceDeltaCents: 200,
            isAvailable: true,
            displayName: 'Uber Option Override',
          },
        ],
        groupConfigs: [
          {
            storeId: 'pos-store',
            templateGroupStableId: 'group-stable',
            displayName: 'Uber Group Override',
            minSelect: 0,
            maxSelect: 1,
            isActive: true,
          },
        ],
        categoryConfigs: [
          {
            storeId: 'pos-store',
            menuCategoryStableId: 'category-stable',
            displayName: 'Uber Category Override',
          },
        ],
      },
    );

    const snapshot = await x.adapter.loadPublishSnapshot(
      'pos-store',
      'uber-store',
    );

    expect(snapshot?.categories[0]?.name).toBe('Uber Category Override');
    expect(snapshot?.items[0]?.name).toBe('Uber Item Override');
    expect(snapshot?.modifierGroups[0]?.name).toBe('Uber Group Override');
    expect(snapshot?.modifierOptions[0]?.name).toBe('Uber Option Override');
  });

  it('inherits legacy Uber price when availability-only canonical row has null price', async () => {
    const x = setup(
      { timezone: 'America/Toronto', salesTaxRate: 0.13 },
      {
        ...bilingualRows,
        itemConfigs: [
          {
            storeId: 'uber-store',
            menuItemStableId: 'item-stable',
            priceCents: 1229,
            isAvailable: true,
            displayName: null,
            displayDescription: null,
          },
          {
            storeId: 'pos-store',
            menuItemStableId: 'item-stable',
            priceCents: null,
            isAvailable: false,
            displayName: null,
            displayDescription: null,
          },
        ],
      },
    );

    const snapshot = await x.adapter.loadPublishSnapshot(
      'pos-store',
      'uber-store',
    );

    expect(snapshot?.items[0]).toMatchObject({
      priceCents: 1229,
      overridePriceCents: 1229,
      priceValueSource: 'UBER_OVERRIDE',
      isAvailable: false,
    });
  });

  it('keeps an explicitly restored item on the SanQ source price', async () => {
    const x = setup(
      { timezone: 'America/Toronto', salesTaxRate: 0.13 },
      {
        ...bilingualRows,
        itemConfigs: [
          {
            storeId: 'uber-store',
            menuItemStableId: 'item-stable',
            priceCents: 1229,
            isAvailable: true,
            displayName: null,
            displayDescription: null,
          },
          {
            storeId: 'pos-store',
            menuItemStableId: 'item-stable',
            priceCents: null,
            isAvailable: true,
            displayName: null,
            displayDescription: null,
          },
        ],
        restoreEvents: [
          {
            payload: {
              posStoreId: 'pos-store',
              menuItemStableId: 'item-stable',
            },
          },
        ],
      },
    );

    const snapshot = await x.adapter.loadPublishSnapshot(
      'pos-store',
      'uber-store',
    );

    expect(snapshot?.items[0]).toMatchObject({
      priceCents: 1099,
      overridePriceCents: null,
      priceValueSource: 'SANQ_SOURCE',
    });
  });

  it('reads legacy default-scoped option overrides deterministically', async () => {
    const x = setup(
      { timezone: 'America/Toronto', salesTaxRate: 0.13 },
      {
        ...bilingualRows,
        optionConfigs: [
          {
            storeId: 'default',
            optionChoiceStableId: 'option-stable',
            priceDeltaCents: 260,
            isAvailable: true,
            displayName: null,
          },
        ],
      },
    );

    const snapshot = await x.adapter.loadPublishSnapshot(
      'pos-store',
      'uber-store',
    );

    expect(snapshot?.modifierOptions[0]).toMatchObject({
      priceDeltaCents: 260,
      overridePriceDeltaCents: 260,
      priceValueSource: 'UBER_OVERRIDE',
    });
    expect(x.prisma.uberOptionItemConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId: { in: ['pos-store', 'uber-store', 'default'] } },
      }),
    );
  });

  it('requests stable SanQ sort ordering for the entire publish graph', async () => {
    const x = setup(
      { timezone: 'America/Toronto', salesTaxRate: 0.13 },
      bilingualRows,
    );
    const stableOrder = [{ sortOrder: 'asc' }, { id: 'asc' }];

    await x.adapter.loadPublishSnapshot('pos-store', 'uber-store');

    expect(x.prisma.menuCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: stableOrder }),
    );
    expect(x.prisma.menuItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: stableOrder,
        select: {
          stableId: true,
          categoryId: true,
          nameEn: true,
          nameZh: true,
          basePriceCents: true,
          isAvailable: true,
          tempUnavailableUntil: true,
          imageUrl: true,
          ingredientsEn: true,
          optionGroups: {
            where: { isEnabled: true },
            orderBy: stableOrder,
            select: { templateGroup: { select: { stableId: true } } },
          },
        },
      }),
    );
    expect(x.prisma.menuOptionGroupTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: stableOrder,
        select: {
          stableId: true,
          nameEn: true,
          nameZh: true,
          defaultMinSelect: true,
          defaultMaxSelect: true,
          options: {
            where: { deletedAt: null },
            orderBy: stableOrder,
            select: {
              stableId: true,
              nameEn: true,
              nameZh: true,
              priceDeltaCents: true,
              isAvailable: true,
              tempUnavailableUntil: true,
            },
          },
        },
      }),
    );
  });

  it('rejects percentage-formatted BusinessConfig.salesTaxRate', async () => {
    const x = setup({ timezone: 'America/Toronto', salesTaxRate: 13 });

    await expect(
      x.adapter.loadPublishSnapshot('pos-store', 'uber-store'),
    ).rejects.toThrow(
      'salesTaxRate 必须使用 0～1 的比例格式，例如 13% 应保存为 0.13',
    );
  });

  it('rejects a missing publish timezone instead of silently falling back', async () => {
    const x = setup({ timezone: '   ', salesTaxRate: 0.13 });

    await expect(
      x.adapter.loadPublishSnapshot('pos-store', 'uber-store'),
    ).rejects.toThrow('发布 Uber 菜单前必须配置门店时区。');
  });
});
