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
import {
  UBER_EATS_MENU_AVAILABILITY,
  type UberEatsMenuAvailabilityPort,
} from '../../integrations/ubereats/public-api';
import { CatalogAdminService } from '../../menu/catalog-admin.service';
import { AdminMenuAvailabilityOrchestrationService } from './admin-menu-availability-orchestration.service';

describe('AdminMenuAvailabilityOrchestrationService Uber status', () => {
  const build = (syncResult: unknown) => {
    const catalog = {
      updateItem: jest.fn().mockResolvedValue({
        ok: true,
        availability: {
          stableId: 'dish-1',
          isAvailable: true,
          tempUnavailableUntil: null,
          effectiveAvailability: true,
        },
      }),
      setItemAvailability: jest
        .fn()
        .mockImplementation((_stableId: string, mode: string) =>
          Promise.resolve({
            stableId: 'dish-1',
            isAvailable: mode !== 'PERMANENT_OFF',
            visibility: 'PUBLIC',
            isVisibleOnMainMenu: true,
            tempUnavailableUntil:
              mode === 'TEMP_TODAY_OFF' ? '2099-01-01T00:00:00.000Z' : null,
            effectiveAvailability: mode === 'ON',
          }),
        ),
      setTemplateOptionAvailability: jest.fn().mockResolvedValue({
        ok: true,
        availability: {
          stableId: 'option-1',
          isAvailable: false,
          tempUnavailableUntil: null,
          effectiveAvailability: false,
        },
      }),
    };
    const syncUberMenuItemAvailability = jest
      .fn()
      .mockResolvedValue(syncResult);
    const syncUberOptionItemAvailability = jest
      .fn()
      .mockResolvedValue(syncResult);
    const uberProvider: {
      provide: typeof UBER_EATS_MENU_AVAILABILITY;
      useValue: jest.Mocked<UberEatsMenuAvailabilityPort>;
    } = {
      provide: UBER_EATS_MENU_AVAILABILITY,
      useValue: {
        syncUberMenuItemAvailability,
        syncUberOptionItemAvailability,
      },
    };
    return {
      service: new AdminMenuAvailabilityOrchestrationService(
        catalog as never,
        uberProvider.useValue,
      ),
      catalog,
      syncUberMenuItemAvailability,
      syncUberOptionItemAvailability,
    };
  };

  it.each([
    ['TEMP_TODAY_OFF', false],
    ['PERMANENT_OFF', false],
    ['ON', true],
  ] as const)('%s 返回结构化 SYNCED 状态', async (mode, available) => {
    const { service, syncUberMenuItemAvailability } = build({
      status: 'SYNCED',
      stores: [],
    });
    const result = await service.setItemAvailability('dish-1', mode);
    expect(result.uberSync.status).toBe('SYNCED');
    expect(syncUberMenuItemAvailability).toHaveBeenCalledWith({
      menuItemStableId: 'dish-1',
      isAvailable: available,
    });
  });

  it('Admin HTTP 响应保留 storeId 字段，同时 Uber public port 使用 storeStableId', async () => {
    const { service } = build({
      status: 'SYNCED',
      stores: [{ storeStableId: '4750_Yonge_Street', status: 'SYNCED' }],
    });

    const result = await service.setItemAvailability('dish-1', 'ON');

    expect(result.uberSync.stores).toEqual([
      { storeId: '4750_Yonge_Street', status: 'SYNCED' },
    ]);
  });

  it('上游异常不会伪装成功，并返回可重试的 FAILED 状态', async () => {
    const { service, syncUberMenuItemAvailability } = build(null);
    syncUberMenuItemAvailability.mockRejectedValue(new Error('upstream'));
    const result = await service.setItemAvailability('dish-1', 'PERMANENT_OFF');
    expect(result.uberSync).toEqual(
      expect.objectContaining({ status: 'FAILED' }),
    );
  });

  it('updateItem 只在 availability 字段变化时同步 Uber，并保持 HTTP ok 响应', async () => {
    const { service, catalog, syncUberMenuItemAvailability } = build({
      status: 'SYNCED',
      stores: [],
    });

    await expect(
      service.updateItem('dish-1', { isAvailable: true }),
    ).resolves.toEqual({ ok: true });
    expect(catalog.updateItem).toHaveBeenCalledWith('dish-1', {
      isAvailable: true,
    });
    expect(syncUberMenuItemAvailability).toHaveBeenCalledWith({
      menuItemStableId: 'dish-1',
      isAvailable: true,
    });

    syncUberMenuItemAvailability.mockClear();
    await service.updateItem('dish-1', { nameEn: 'Updated' });
    expect(syncUberMenuItemAvailability).not.toHaveBeenCalled();
  });

  it('option availability 仍通过 Uber public port 同步', async () => {
    const { service, syncUberOptionItemAvailability } = build({
      status: 'SYNCED',
      stores: [],
    });

    await expect(
      service.setTemplateOptionAvailability('option-1', 'PERMANENT_OFF'),
    ).resolves.toEqual({ ok: true });
    expect(syncUberOptionItemAvailability).toHaveBeenCalledWith({
      optionChoiceStableId: 'option-1',
      isAvailable: false,
    });
  });
});

describe('CatalogAdminService availability persistence', () => {
  it.each([
    ['ON', true, false],
    ['PERMANENT_OFF', false, false],
    ['TEMP_TODAY_OFF', true, true],
  ] as const)(
    '%s keeps the existing availability persistence semantics',
    async (mode, isAvailable, temporary) => {
      const update = jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          stableId: 'dish-1',
          ...data,
          visibility: 'PUBLIC',
          isVisibleOnMainMenu: true,
        }),
      );
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

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stableId: 'dish-1' },
          data: expect.objectContaining({ isAvailable }),
        }),
      );
      const updateArgument = update.mock.calls[0]?.[0] as
        | { data: { tempUnavailableUntil: unknown } }
        | undefined;
      if (temporary) {
        expect(updateArgument?.data.tempUnavailableUntil).toBeInstanceOf(Date);
      } else {
        expect(updateArgument?.data.tempUnavailableUntil).toBeNull();
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
            publishToUberEats: false,
            fixedComponents: [],
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

  it('blocks Uber Eats publishing while fixed component context is unsupported', async () => {
    const update = jest.fn();
    const service = new CatalogAdminService(
      {
        menuItem: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'combo-db-id',
            publishToUberEats: true,
            fixedComponents: [],
            optionGroups: [],
          }),
          findMany: jest.fn().mockResolvedValue([{ stableId: 'hulatang' }]),
          update,
        },
        menuItemComponent: { findMany: jest.fn().mockResolvedValue([]) },
      } as never,
      {} as never,
    );

    await expect(
      service.updateItem('breakfast-combo', {
        fixedComponents: [{ componentItemStableId: 'hulatang', quantity: 1 }],
      }),
    ).rejects.toThrow('Fixed combo items cannot be published to Uber Eats');
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a fixed combo containing itself', async () => {
    const update = jest.fn();
    const service = new CatalogAdminService(
      {
        menuItem: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'combo-db-id',
            publishToUberEats: false,
            fixedComponents: [],
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
