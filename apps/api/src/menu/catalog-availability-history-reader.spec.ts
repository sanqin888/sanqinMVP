import { CatalogAdminService } from './catalog-admin.service';

describe('CatalogAdminService availability history reader', () => {
  it('returns only overlapping unavailable intervals with forward coverage', async () => {
    const trackingStartedAt = new Date('2026-10-04T14:00:00.000Z');
    const fromInclusive = new Date('2026-10-05T04:00:00.000Z');
    const toExclusive = new Date('2026-10-06T04:00:00.000Z');
    const findMany = jest.fn().mockResolvedValue([
      {
        menuItemStableId: 'item-1',
        nameEnSnapshot: 'Item One',
        nameZhSnapshot: '菜品一',
        startedAt: new Date('2026-10-05T15:00:00.000Z'),
        endedAt: new Date('2026-10-05T16:00:00.000Z'),
      },
    ]);
    const service = new CatalogAdminService({
      catalogAvailabilityHistoryState: {
        findUnique: jest.fn().mockResolvedValue({ trackingStartedAt }),
      },
      catalogItemUnavailableInterval: { findMany },
    } as never);

    await expect(
      service.readItemUnavailableHistoryForRange({
        storeStableId: 'store-1',
        fromInclusive,
        toExclusive,
      }),
    ).resolves.toEqual({
      storeStableId: 'store-1',
      trackingStartedAt,
      intervals: [
        {
          menuItemStableId: 'item-1',
          nameEnSnapshot: 'Item One',
          nameZhSnapshot: '菜品一',
          startedAt: new Date('2026-10-05T15:00:00.000Z'),
          endedAt: new Date('2026-10-05T16:00:00.000Z'),
        },
      ],
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        storeStableId: 'store-1',
        startedAt: { lt: toExclusive },
        OR: [{ endedAt: null }, { endedAt: { gt: fromInclusive } }],
      },
      orderBy: [{ startedAt: 'asc' }, { menuItemStableId: 'asc' }],
      select: {
        menuItemStableId: true,
        nameEnSnapshot: true,
        nameZhSnapshot: true,
        startedAt: true,
        endedAt: true,
      },
    });
  });

  it('returns null when forward-only Catalog history has not started', async () => {
    const service = new CatalogAdminService({
      catalogAvailabilityHistoryState: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    } as never);

    await expect(
      service.readItemUnavailableHistoryForRange({
        storeStableId: 'store-1',
        fromInclusive: new Date('2026-10-01T04:00:00.000Z'),
        toExclusive: new Date('2026-10-02T04:00:00.000Z'),
      }),
    ).resolves.toBeNull();
  });
});
