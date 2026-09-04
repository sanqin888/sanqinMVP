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
  it.each([
    ['ON', true, false],
    ['PERMANENT_OFF', false, false],
    ['TEMP_TODAY_OFF', true, true],
  ] as const)(
    '%s keeps the existing availability persistence semantics',
    async (mode, isAvailable, temporary) => {
      type AvailabilityUpdateData = {
        isAvailable: boolean;
        tempUnavailableUntil: Date | null;
      };
      let capturedData: AvailabilityUpdateData | undefined;
      const update = jest.fn((input: { data: AvailabilityUpdateData }) => {
        capturedData = input.data;
        return Promise.resolve({
          stableId: 'dish-1',
          ...input.data,
          visibility: 'PUBLIC',
          isVisibleOnMainMenu: true,
        });
      });
      const service = new CatalogAdminService({
        menuItem: {
          findFirst: jest.fn().mockResolvedValue({ id: 'item-db-1' }),
          update,
        },
      } as never);

      await service.setItemAvailability('dish-1', mode);

      expect(capturedData?.isAvailable).toBe(isAvailable);
      if (temporary) {
        expect(capturedData?.tempUnavailableUntil).toBeInstanceOf(Date);
      } else {
        expect(capturedData?.tempUnavailableUntil).toBeNull();
      }
    },
  );
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
      service.getMenuItemAvailabilitySnapshot(' item-1 '),
    ).resolves.toEqual({
      stableId: 'item-1',
      visibility: 'PUBLIC',
      publishToUberEats: true,
      tempUnavailableUntil: '2090-01-02T03:04:05.000Z',
      hasFixedComponents: true,
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { stableId: 'item-1', deletedAt: null },
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
      service.getOptionAvailabilitySnapshot('option-1'),
    ).resolves.toEqual({
      stableId: 'option-1',
      tempUnavailableUntil: '2090-01-02T03:04:05.000Z',
    });
  });
});

describe('CatalogAdminService pricing snapshots', () => {
  it('keeps the full Admin menu snapshot free of Offers-owned fields and persistence', async () => {
    const prisma = {
      menuCategory: { findMany: jest.fn().mockResolvedValue([]) },
      menuOptionGroupTemplate: { findMany: jest.fn().mockResolvedValue([]) },
      menuPackagingType: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CatalogAdminService(prisma as never);

    await expect(service.getFullMenu()).resolves.toEqual({
      categories: [],
      templatesLite: [],
      packagingTypes: [],
    });
    expect('menuDailySpecial' in prisma).toBe(false);
  });

  it('projects menu item stable ids and base prices without reading Offers persistence', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([{ stableId: 'item-1', basePriceCents: 1299 }]);
    const service = new CatalogAdminService({
      menuItem: { findMany },
    } as never);

    await expect(service.getMenuItemPricingSnapshots()).resolves.toEqual([
      { itemStableId: 'item-1', basePriceCents: 1299 },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      select: { stableId: true, basePriceCents: true },
    });

    await service.getMenuItemPricingSnapshots({ includeDeleted: true });
    expect(findMany).toHaveBeenLastCalledWith({
      where: {},
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

    await service.updateItem('breakfast-combo', {
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
      service.updateItem('breakfast-combo', {
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

    await service.bindTemplateGroupToItem('item-1', {
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
      service.bindTemplateGroupToItem('item-1', {
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
