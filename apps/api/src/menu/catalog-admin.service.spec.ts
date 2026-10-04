jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  SpecialPricingMode: {},
}));
jest.mock(
  '@shared/menu',
  () => ({
    isAvailableNow: ({
      isAvailable,
      tempUnavailableUntil,
    }: {
      isAvailable: boolean;
      tempUnavailableUntil: string | null;
    }) =>
      isAvailable &&
      (!tempUnavailableUntil || Date.parse(tempUnavailableUntil) <= Date.now()),
  }),
  { virtual: true },
);
import { CatalogAdminService } from './catalog-admin.service';

describe('CatalogAdminService availability persistence', () => {
  it('rejects generic Item availability fields so history capture cannot be bypassed', async () => {
    const service = new CatalogAdminService({} as never);

    await expect(
      service.updateItem(
        'store-1',
        'dish-1',
        { isAvailable: false } as never,
      ),
    ).rejects.toThrow('Use the dedicated item availability endpoint');
  });

  it('keeps current-state and history writes inside one Prisma transaction', async () => {
    const historyFailure = new Error('history write failed');
    const tx = {
      menuItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'item-db-1',
          stableId: 'dish-1',
          nameEn: 'Dish',
          nameZh: '菜',
          isAvailable: true,
          tempUnavailableUntil: null,
        }),
        update: jest.fn().mockResolvedValue({
          stableId: 'dish-1',
          isAvailable: false,
          visibility: 'PUBLIC',
          isVisibleOnMainMenu: true,
          tempUnavailableUntil: null,
        }),
      },
      catalogAvailabilityHistoryState: {
        findUnique: jest.fn().mockResolvedValue({ storeStableId: 'store-1' }),
      },
      catalogItemUnavailableInterval: {
        create: jest.fn().mockRejectedValue(historyFailure),
      },
    };
    const transaction = jest.fn(
      async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    );
    const service = new CatalogAdminService({
      $transaction: transaction,
    } as never);

    await expect(
      service.setItemAvailability('store-1', 'dish-1', 'PERMANENT_OFF', {
        effectiveAt: new Date('2026-10-04T14:00:00.000Z'),
        tempUnavailableUntil: null,
      }),
    ).rejects.toBe(historyFailure);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.menuItem.update).toHaveBeenCalledTimes(1);
    expect(tx.catalogItemUnavailableInterval.create).toHaveBeenCalledTimes(1);
  });
});

describe('CatalogAdminService availability reader', () => {
  it('projects canonical item availability facts for external-channel consumers', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      stableId: 'item-1',
      visibility: 'PUBLIC',
      publishToUberEats: true,
      tempUnavailableUntil: new Date('2090-01-02T03:04:05.000Z'),
      fixedComponents: [{ id: 'component-db-1' }],
    });
    const service = new CatalogAdminService({
      menuItem: { findFirst },
    } as never);

    await expect(
      service.getMenuItemAvailabilitySnapshot('store-1', ' item-1 '),
    ).resolves.toEqual({
      stableId: 'item-1',
      visibility: 'PUBLIC',
      publishToUberEats: true,
      tempUnavailableUntil: '2090-01-02T03:04:05.000Z',
      hasFixedComponents: true,
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        stableId: 'item-1',
        deletedAt: null,
        category: { storeStableId: 'store-1', deletedAt: null },
      },
      select: {
        stableId: true,
        visibility: true,
        publishToUberEats: true,
        tempUnavailableUntil: true,
        fixedComponents: { select: { id: true } },
      },
    });
  });

  it('projects option suspend-until without exposing Prisma models', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      stableId: 'option-1',
      tempUnavailableUntil: new Date('2090-01-02T03:04:05.000Z'),
    });
    const service = new CatalogAdminService({
      menuOptionTemplateChoice: { findFirst },
    } as never);

    await expect(
      service.getOptionAvailabilitySnapshot('store-1', 'option-1'),
    ).resolves.toEqual({
      stableId: 'option-1',
      tempUnavailableUntil: '2090-01-02T03:04:05.000Z',
    });
  });
});

describe('CatalogAdminService order facts reader', () => {
  it('projects hidden item identity as stable ids only', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([{ stableId: 'hidden-item-1' }]);
    const service = new CatalogAdminService({
      menuItem: { findMany },
    } as never);

    await expect(
      service.findHiddenMenuItemStableIds('store-1', [' hidden-item-1 ']),
    ).resolves.toEqual(['hidden-item-1']);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        stableId: { in: ['hidden-item-1'] },
        deletedAt: null,
        visibility: 'HIDDEN',
        category: { storeStableId: 'store-1', deletedAt: null },
      },
      select: { stableId: true },
    });
  });

  it('projects stable-only materialization facts for Orders', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        stableId: 'item-1',
        nameEn: 'Combo',
        nameZh: '套餐',
        basePriceCents: 1299,
        isAvailable: true,
        tempUnavailableUntil: new Date('2090-01-02T03:04:05.000Z'),
        fixedComponents: [
          {
            componentItemStableId: 'component-1',
            quantity: 2,
            sortOrder: 0,
          },
        ],
        optionGroups: [
          {
            minSelect: 0,
            maxSelect: 1,
            sortOrder: 0,
            templateGroup: {
              stableId: 'group-1',
              nameEn: 'Choice',
              nameZh: '选择',
              defaultMinSelect: 0,
              defaultMaxSelect: 1,
              sortOrder: 0,
              deletedAt: null,
              options: [
                {
                  stableId: 'choice-1',
                  nameEn: 'Soup',
                  nameZh: '汤',
                  priceDeltaCents: 100,
                  targetItemStableId: 'component-1',
                  isAvailable: true,
                  tempUnavailableUntil: null,
                  sortOrder: 0,
                },
              ],
            },
          },
        ],
      },
    ]);
    const service = new CatalogAdminService({
      menuItem: { findMany },
    } as never);

    await expect(
      service.getOrderItemMaterializationFacts('store-1', [' item-1 ']),
    ).resolves.toEqual([
      {
        stableId: 'item-1',
        nameEn: 'Combo',
        nameZh: '套餐',
        basePriceCents: 1299,
        isAvailable: true,
        tempUnavailableUntil: '2090-01-02T03:04:05.000Z',
        fixedComponents: [
          {
            componentItemStableId: 'component-1',
            quantity: 2,
            sortOrder: 0,
          },
        ],
        optionGroups: [
          {
            minSelect: 0,
            maxSelect: 1,
            sortOrder: 0,
            templateGroup: {
              stableId: 'group-1',
              nameEn: 'Choice',
              nameZh: '选择',
              defaultMinSelect: 0,
              defaultMaxSelect: 1,
              sortOrder: 0,
              options: [
                {
                  stableId: 'choice-1',
                  nameEn: 'Soup',
                  nameZh: '汤',
                  priceDeltaCents: 100,
                  targetItemStableId: 'component-1',
                  isAvailable: true,
                  tempUnavailableUntil: null,
                  sortOrder: 0,
                },
              ],
            },
          },
        ],
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          stableId: { in: ['item-1'] },
          category: { storeStableId: 'store-1', deletedAt: null },
        },
      }),
    );
  });

  it('projects label configuration without packaging persistence ids', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        stableId: 'item-1',
        nameEn: 'Soup',
        nameZh: '汤',
        labelStrategy: 'ALWAYS',
        packagings: [
          {
            sortOrder: 0,
            packagingType: { stableId: '16oz', name: '16oz' },
          },
        ],
        optionGroups: [
          {
            affectedPackagingTypeStableIds: ['16oz'],
            templateGroup: { stableId: 'spice' },
          },
        ],
      },
    ]);
    const service = new CatalogAdminService({
      menuItem: { findMany },
    } as never);

    await expect(
      service.getOrderLabelConfigs('store-1', [' item-1 ']),
    ).resolves.toEqual([
      {
        stableId: 'item-1',
        nameEn: 'Soup',
        nameZh: '汤',
        labelStrategy: 'ALWAYS',
        packagings: [
          {
            sortOrder: 0,
            packagingType: { stableId: '16oz', name: '16oz' },
          },
        ],
        optionGroups: [
          {
            affectedPackagingTypeStableIds: ['16oz'],
            templateGroupStableId: 'spice',
          },
        ],
      },
    ]);
  });
});

describe('CatalogAdminService admin workspace reads', () => {
  it('lists only live categories for the requested Store without loading items', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        stableId: 'drinks',
        nameEn: 'Drinks',
        nameZh: '饮品',
        sortOrder: 20,
        isActive: true,
      },
    ]);
    const service = new CatalogAdminService({
      menuCategory: { findMany },
    } as never);

    await expect(service.listCategories(' store-1 ')).resolves.toEqual([
      {
        stableId: 'drinks',
        nameEn: 'Drinks',
        nameZh: '饮品',
        sortOrder: 20,
        isActive: true,
      },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { storeStableId: 'store-1', deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: {
        stableId: true,
        nameEn: true,
        nameZh: true,
        sortOrder: true,
        isActive: true,
      },
    });
  });
});

describe('CatalogAdminService item workspace reads', () => {
  it('lists only live items rooted in the requested Store', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new CatalogAdminService({
      menuItem: { findMany },
    } as never);

    await expect(service.listItems(' store-1 ')).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        category: { storeStableId: 'store-1', deletedAt: null },
      },
      orderBy: { sortOrder: 'asc' },
      include: {
        category: { select: { stableId: true } },
        packagings: {
          orderBy: { sortOrder: 'asc' },
          include: { packagingType: true },
        },
        fixedComponents: {
          orderBy: { sortOrder: 'asc' },
        },
        optionGroups: {
          where: { templateGroup: { deletedAt: null } },
          orderBy: { sortOrder: 'asc' },
          include: {
            templateGroup: {
              select: {
                stableId: true,
                nameEn: true,
                nameZh: true,
                deletedAt: true,
                defaultMinSelect: true,
                defaultMaxSelect: true,
                isAvailable: true,
                tempUnavailableUntil: true,
                sortOrder: true,
              },
            },
          },
        },
      },
    });
  });

  it('lists the live brand-level packaging dictionary without Store filtering', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([
        { stableId: '16oz', name: '16oz', isActive: true, sortOrder: 1 },
      ]);
    const service = new CatalogAdminService({
      menuPackagingType: { findMany },
    } as never);

    await expect(service.listPackagingTypes()).resolves.toEqual([
      { stableId: '16oz', name: '16oz', isActive: true, sortOrder: 1 },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
  });
});

describe('CatalogAdminService pricing snapshots', () => {
  it('projects menu item stable ids and base prices without reading Offers persistence', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([{ stableId: 'item-1', basePriceCents: 1299 }]);
    const service = new CatalogAdminService({
      menuItem: { findMany },
    } as never);

    await expect(
      service.getMenuItemPricingSnapshots('store-1'),
    ).resolves.toEqual([{ itemStableId: 'item-1', basePriceCents: 1299 }]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        category: { storeStableId: 'store-1' },
      },
      select: { stableId: true, basePriceCents: true },
    });

    await service.getMenuItemPricingSnapshots('store-1', {
      includeDeleted: true,
    });
    expect(findMany).toHaveBeenLastCalledWith({
      where: { category: { storeStableId: 'store-1' } },
      select: { stableId: true, basePriceCents: true },
    });
  });
});

describe('CatalogAdminService fixed combo composition', () => {
  it('stores fixed components by stable business id and quantity', async () => {
    type MenuItemUpdate = (args: unknown) => Promise<{ stableId: string }>;
    const update: jest.MockedFunction<MenuItemUpdate> = jest
      .fn()
      .mockResolvedValue({ stableId: 'breakfast-combo' });
    const service = new CatalogAdminService({
      menuItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'combo-db-id',
          optionGroups: [],
        }),
        findMany: jest
          .fn()
          .mockResolvedValue([
            { stableId: 'hulatang' },
            { stableId: 'youtiao' },
          ]),
        update,
      },
      menuItemComponent: { findMany: jest.fn().mockResolvedValue([]) },
    } as never);

    await service.updateItem('store-1', 'breakfast-combo', {
      fixedComponents: [
        { componentItemStableId: 'hulatang', quantity: 1 },
        { componentItemStableId: 'youtiao', quantity: 2 },
      ],
    });

    const updateArg = update.mock.calls[0]?.[0] as
      | { where?: unknown; data?: unknown }
      | undefined;
    expect(updateArg?.where).toEqual({ stableId: 'breakfast-combo' });
    const updateData = updateArg?.data as
      | { fixedComponents?: unknown }
      | undefined;
    expect(updateData?.fixedComponents).toEqual({
      deleteMany: {},
      create: [
        {
          componentItemStableId: 'hulatang',
          quantity: 1,
          sortOrder: 0,
        },
        {
          componentItemStableId: 'youtiao',
          quantity: 2,
          sortOrder: 1,
        },
      ],
    });
  });

  it('rejects a fixed combo containing itself', async () => {
    const update = jest.fn();
    const service = new CatalogAdminService({
      menuItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'combo-db-id',
          optionGroups: [],
        }),
        update,
      },
    } as never);

    await expect(
      service.updateItem('store-1', 'breakfast-combo', {
        fixedComponents: [
          { componentItemStableId: 'breakfast-combo', quantity: 1 },
        ],
      }),
    ).rejects.toThrow('A menu item cannot contain itself');
    expect(update).not.toHaveBeenCalled();
  });
});

describe('CatalogAdminService packaging option scope', () => {
  it('single-package items always store option scope as all packaging', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const service = new CatalogAdminService({
      menuItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'item-1',
          packagings: [{ packagingType: { stableId: 'packaging-16oz' } }],
        }),
      },
      menuOptionGroupTemplate: {
        findFirst: jest.fn().mockResolvedValue({ id: 'template-1' }),
      },
      menuItemOptionGroup: { upsert },
    } as never);

    await service.bindTemplateGroupToItem('store-1', 'item-1', {
      templateGroupStableId: 'spice',
      minSelect: 0,
      maxSelect: 1,
      sortOrder: 0,
      isEnabled: true,
      affectedPackagingTypeStableIds: ['packaging-16oz'],
    });

    expect(upsert).toHaveBeenCalledWith({
      where: {
        itemId_templateGroupId: {
          itemId: 'item-1',
          templateGroupId: 'template-1',
        },
      },
      create: {
        itemId: 'item-1',
        templateGroupId: 'template-1',
        minSelect: 0,
        maxSelect: 1,
        sortOrder: 0,
        isEnabled: true,
        affectedPackagingTypeStableIds: [],
      },
      update: {
        minSelect: 0,
        maxSelect: 1,
        sortOrder: 0,
        isEnabled: true,
        affectedPackagingTypeStableIds: [],
      },
    });
  });

  it('multi-package items reject an option scope outside the item packaging list', async () => {
    const upsert = jest.fn();
    const service = new CatalogAdminService({
      menuItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'item-1',
          packagings: [
            { packagingType: { stableId: 'packaging-38oz' } },
            { packagingType: { stableId: 'packaging-16oz' } },
          ],
        }),
      },
      menuOptionGroupTemplate: { findFirst: jest.fn() },
      menuItemOptionGroup: { upsert },
    } as never);

    await expect(
      service.bindTemplateGroupToItem('store-1', 'item-1', {
        templateGroupStableId: 'spice',
        minSelect: 0,
        maxSelect: 1,
        sortOrder: 0,
        isEnabled: true,
        affectedPackagingTypeStableIds: ['packaging-not-used'],
      }),
    ).rejects.toThrow('Packaging type not available for item');
    expect(upsert).not.toHaveBeenCalled();
  });
});
