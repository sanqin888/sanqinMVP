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
    storeConfig: {
      timezone: string;
      salesTaxRate: number;
      hours?: Array<{
        weekday: number;
        openMinutes: number | null;
        closeMinutes: number | null;
        isClosed: boolean;
      }>;
    },
    rows: SnapshotRows = {},
  ) => {
    const prisma = {
      uberStoreMapping: {
        findFirst: jest.fn().mockResolvedValue({ uberStoreId: 'uber-store' }),
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
    const businessSchedule = {
      readBusinessSchedule: jest.fn().mockResolvedValue({
        timezone: storeConfig.timezone,
        salesTaxRate: storeConfig.salesTaxRate,
        hours: storeConfig.hours ?? [
          {
            weekday: 1,
            openMinutes: 480,
            closeMinutes: 1350,
            isClosed: false,
          },
        ],
      }),
    };
    const catalogFacts = {
      readMenuSource: jest.fn().mockResolvedValue({
        categories: rows.categories ?? [],
        menuItems: rows.menuItems ?? [],
        modifierTemplates: rows.templates ?? [],
      }),
    };
    return {
      prisma,
      businessSchedule,
      catalogFacts,
      adapter: new UberMenuSnapshotPrismaAdapter(
        prisma as never,
        businessSchedule as never,
        catalogFacts as never,
      ),
    };
  };

  const bilingualRows: SnapshotRows = {
    categories: [
      {
        stableId: 'category-stable',
        nameEn: 'Dry Noodles',
        nameZh: '拌面',
        sortOrder: 1,
        isActive: true,
      },
    ],
    menuItems: [
      {
        stableId: 'item-stable',
        categoryStableId: 'category-stable',
        nameEn: 'Tomato Fried Egg Noodles',
        nameZh: '番茄鸡蛋面',
        basePriceCents: 1099,
        isAvailable: true,
        tempUnavailableUntil: null,
        visibility: 'PUBLIC',
        publishToUberEats: true,
        sortOrder: 1,
        imageUrl: null,
        ingredientsEn: null,
        optionGroups: [
          {
            templateGroupStableId: 'group-stable',
            sortOrder: 1,
            isEnabled: true,
          },
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
        isAvailable: true,
        sortOrder: 1,
        options: [
          {
            stableId: 'option-stable',
            nameEn: 'Large',
            nameZh: '大份',
            priceDeltaCents: 200,
            isAvailable: true,
            tempUnavailableUntil: null,
            sortOrder: 1,
            targetItemStableId: null,
            childTemplateGroupStableIds: [],
          },
        ],
      },
    ],
  };

  it('loads canonical store timezone and converts salesTaxRate to Uber percentage', async () => {
    const x = setup({ timezone: ' America/Toronto ', salesTaxRate: 0.13 });

    const snapshot = await x.adapter.loadPublishSnapshot(
      'pos-store',
      'uber-store',
    );

    expect(x.businessSchedule.readBusinessSchedule).toHaveBeenCalledWith(
      'pos-store',
    );
    expect(snapshot).toMatchObject({
      timezone: 'America/Toronto',
      taxRate: 13,
      serviceAvailability: [
        {
          day_of_week: 'monday',
          time_periods: [{ start_time: '08:00', end_time: '22:30' }],
        },
      ],
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

  it('keeps canonical store pricing when legacy provider-scoped rows are present', async () => {
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
      priceCents: 1099,
      overridePriceCents: null,
      priceValueSource: 'SANQ_SOURCE',
      isAvailable: false,
    });
    expect(x.prisma.uberItemChannelConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { storeId: 'pos-store' } }),
    );
  });

  it('uses the SanQ source price when the canonical override is null', async () => {
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
      priceCents: 1099,
      overridePriceCents: null,
      priceValueSource: 'SANQ_SOURCE',
    });
  });

  it('reads option overrides only from the canonical store scope', async () => {
    const x = setup(
      { timezone: 'America/Toronto', salesTaxRate: 0.13 },
      {
        ...bilingualRows,
        optionConfigs: [
          {
            storeId: 'pos-store',
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
        where: { storeId: 'pos-store' },
      }),
    );
  });

  it('reads canonical publish facts through the Catalog capability', async () => {
    const x = setup(
      { timezone: 'America/Toronto', salesTaxRate: 0.13 },
      bilingualRows,
    );

    await x.adapter.loadPublishSnapshot('pos-store', 'uber-store');

    expect(x.catalogFacts.readMenuSource).toHaveBeenCalledTimes(1);
  });

  it('rejects percentage-formatted canonical salesTaxRate', async () => {
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
