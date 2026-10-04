import {
  captureCatalogAvailabilityTransition,
  initializeCatalogAvailabilityHistory,
} from './catalog-availability-history.persistence';

describe('Catalog availability history persistence', () => {
  it('initializes forward-only baseline once and ignores expired temporary unavailability', async () => {
    const trackingStartedAt = new Date('2026-10-04T14:00:00.000Z');
    const stateCreateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const intervalCreateMany = jest.fn().mockResolvedValue({ count: 2 });
    const findMany = jest.fn().mockResolvedValue([
      {
        stableId: 'permanent-off',
        nameEn: 'Permanent',
        nameZh: null,
        isAvailable: false,
        tempUnavailableUntil: null,
      },
      {
        stableId: 'temp-active',
        nameEn: 'Temporary',
        nameZh: '临时',
        isAvailable: true,
        tempUnavailableUntil: new Date('2026-10-05T04:00:00.000Z'),
      },
      {
        stableId: 'temp-expired',
        nameEn: 'Expired',
        nameZh: null,
        isAvailable: true,
        tempUnavailableUntil: new Date('2026-10-04T13:59:59.000Z'),
      },
    ]);
    const tx = {
      catalogAvailabilityHistoryState: { createMany: stateCreateMany },
      menuItem: { findMany },
      catalogItemUnavailableInterval: { createMany: intervalCreateMany },
    };

    await expect(
      initializeCatalogAvailabilityHistory(
        tx as never,
        'store-1',
        trackingStartedAt,
      ),
    ).resolves.toBe(true);
    await expect(
      initializeCatalogAvailabilityHistory(
        tx as never,
        'store-1',
        new Date('2026-10-04T15:00:00.000Z'),
      ),
    ).resolves.toBe(false);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(intervalCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          menuItemStableId: 'permanent-off',
          startedAt: trackingStartedAt,
          endedAt: null,
        }),
        expect.objectContaining({
          menuItemStableId: 'temp-active',
          nameZhSnapshot: '临时',
          startedAt: trackingStartedAt,
          endedAt: new Date('2026-10-05T04:00:00.000Z'),
        }),
      ],
    });
  });

  it('keeps TEMP -> PERMANENT as one continuous interval', async () => {
    const update = jest.fn().mockResolvedValue({});
    const create = jest.fn();
    const tx = {
      catalogItemUnavailableInterval: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'interval-1',
          endedAt: new Date('2026-10-05T04:00:00.000Z'),
        }),
        update,
        create,
      },
    };
    await captureCatalogAvailabilityTransition(tx as never, {
      storeStableId: 'store-1',
      item: { stableId: 'dish-1', nameEn: 'Dish', nameZh: '菜' },
      wasUnavailable: true,
      isUnavailable: true,
      effectiveAt: new Date('2026-10-04T16:00:00.000Z'),
      unavailableUntil: null,
    });
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'interval-1' },
      data: { endedAt: null },
    });
  });

  it('creates separate intervals when the same item is restored and disabled again', async () => {
    const create = jest.fn().mockResolvedValue({});
    const update = jest.fn().mockResolvedValue({});
    const tx = {
      catalogItemUnavailableInterval: {
        create,
        findFirst: jest.fn().mockResolvedValue({
          id: 'interval-1',
          endedAt: null,
        }),
        update,
      },
    };
    const item = { stableId: 'dish-1', nameEn: 'Dish', nameZh: null };

    await captureCatalogAvailabilityTransition(tx as never, {
      storeStableId: 'store-1',
      item,
      wasUnavailable: false,
      isUnavailable: true,
      effectiveAt: new Date('2026-10-04T14:00:00.000Z'),
      unavailableUntil: null,
    });
    await captureCatalogAvailabilityTransition(tx as never, {
      storeStableId: 'store-1',
      item,
      wasUnavailable: true,
      isUnavailable: false,
      effectiveAt: new Date('2026-10-04T15:00:00.000Z'),
      unavailableUntil: null,
    });
    await captureCatalogAvailabilityTransition(tx as never, {
      storeStableId: 'store-1',
      item,
      wasUnavailable: false,
      isUnavailable: true,
      effectiveAt: new Date('2026-10-04T16:00:00.000Z'),
      unavailableUntil: new Date('2026-10-05T04:00:00.000Z'),
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'interval-1' },
      data: { endedAt: new Date('2026-10-04T15:00:00.000Z') },
    });
  });
});
