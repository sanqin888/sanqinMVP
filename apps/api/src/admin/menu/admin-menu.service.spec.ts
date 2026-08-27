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
import { AdminMenuService } from './admin-menu.service';

describe('AdminMenuService availability Uber status', () => {
  const build = (syncResult: unknown) => {
    const prisma = {
      menuItem: {
        findFirst: jest.fn().mockResolvedValue({ id: 1 }),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            stableId: 'dish-1',
            ...data,
            visibility: 'PUBLIC',
            isVisibleOnMainMenu: true,
          }),
        ),
      },
    };
    const syncUberMenuItemAvailability = jest
      .fn()
      .mockResolvedValue(syncResult);
    const uberProvider: {
      provide: typeof UBER_EATS_MENU_AVAILABILITY;
      useValue: jest.Mocked<UberEatsMenuAvailabilityPort>;
    } = {
      provide: UBER_EATS_MENU_AVAILABILITY,
      useValue: {
        syncUberMenuItemAvailability,
        syncUberOptionItemAvailability: jest.fn(),
      },
    };
    return {
      service: new AdminMenuService(prisma as never, uberProvider.useValue),
      syncUberMenuItemAvailability,
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

  it('上游异常不会伪装成功，并返回可重试的 FAILED 状态', async () => {
    const { service, syncUberMenuItemAvailability } = build(null);
    syncUberMenuItemAvailability.mockRejectedValue(new Error('upstream'));
    const result = await service.setItemAvailability('dish-1', 'PERMANENT_OFF');
    expect(result.uberSync).toEqual(
      expect.objectContaining({ status: 'FAILED' }),
    );
  });
});

describe('AdminMenuService daily specials weekdays', () => {
  it('loads specials for all seven weekdays when no weekday is specified', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new AdminMenuService(
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
    const service = new AdminMenuService(
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

describe('AdminMenuService packaging option scope', () => {
  it('single-package items always store option scope as all packaging', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const service = new AdminMenuService(
      {
        menuItem: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'item-1',
            packagings: [
              { packagingType: { stableId: 'packaging-16oz' } },
            ],
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

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          affectedPackagingTypeStableIds: [],
        }),
        update: expect.objectContaining({
          affectedPackagingTypeStableIds: [],
        }),
      }),
    );
  });

  it('multi-package items reject an option scope outside the item packaging list', async () => {
    const upsert = jest.fn();
    const service = new AdminMenuService(
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
