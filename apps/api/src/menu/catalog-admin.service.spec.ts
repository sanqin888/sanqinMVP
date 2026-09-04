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
      const service = new CatalogAdminService(
        {
          menuItem: {
            findFirst: jest.fn().mockResolvedValue({ id: 'item-db-1' }),
            update,
          },
        } as never,
        {} as never,
      );

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

describe('CatalogAdminService daily specials weekdays', () => {
  it('loads specials for all seven weekdays when no weekday is specified', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new CatalogAdminService(
      { menuDailySpecial: { findMany } } as never,
      {} as never,
    );

    await service.getDailySpecials();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          weekday: { in: [1, 2, 3, 4, 5, 6, 7] },
        },
      }),
    );
  });

  it.each([6, 7])('accepts weekend weekday %i', async (weekday) => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new CatalogAdminService(
      { menuDailySpecial: { findMany } } as never,
      {} as never,
    );

    await expect(service.getDailySpecials(weekday)).resolves.toEqual({
      specials: [],
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, weekday },
      }),
    );
  });
});

describe('CatalogAdminService fixed combo composition', () => {
  it('stores fixed components by stable business id and quantity', async () => {
    type MenuItemUpdate = (args: unknown) => Promise<{ stableId: string }>;
    const update: jest.MockedFunction<MenuItemUpdate> = jest
      .fn()
      .mockResolvedValue({ stableId: 'breakfast-combo' });
    const service = new CatalogAdminService(
      {
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
      } as never,
      {} as never,
    );

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
    const service = new CatalogAdminService(
      {
        menuItem: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'combo-db-id',
            optionGroups: [],
          }),
          update,
        },
      } as never,
      {} as never,
    );

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
    const service = new CatalogAdminService(
      {
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
      } as never,
      {} as never,
    );

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
    const service = new CatalogAdminService(
      {
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
      } as never,
      {} as never,
    );

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
