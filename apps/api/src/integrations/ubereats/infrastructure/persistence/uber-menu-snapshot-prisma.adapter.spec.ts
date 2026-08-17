import { UberMenuSnapshotPrismaAdapter } from './uber-menu-snapshot-prisma.adapter';

type SnapshotRows = {
  categories?: unknown[];
  menuItems?: unknown[];
  templates?: unknown[];
  itemConfigs?: unknown[];
  optionConfigs?: unknown[];
  groupConfigs?: unknown[];
  categoryConfigs?: unknown[];
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
        imageUrl: null,
        ingredientsEn: null,
        optionGroups: [
          { templateGroup: { stableId: 'group-stable' } },
        ],
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
