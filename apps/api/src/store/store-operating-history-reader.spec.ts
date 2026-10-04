import { PrismaBrandStoreConfigReader } from './brand-store-config.reader';

describe('PrismaBrandStoreConfigReader operating history', () => {
  it('returns the version active at range start, later versions, and overlapping closures', async () => {
    const fromInclusive = new Date('2026-10-05T04:00:00.000Z');
    const toExclusive = new Date('2026-10-06T04:00:00.000Z');
    const trackingStartedAt = new Date('2026-10-04T14:00:00.000Z');
    const activeVersion = {
      revision: 1,
      effectiveFrom: trackingStartedAt,
      timezone: 'America/Toronto',
      businessHoursSnapshot: [
        {
          weekday: 0,
          openMinutes: 600,
          closeMinutes: 1200,
          isClosed: false,
        },
      ],
      holidaysSnapshot: [],
    };
    const laterVersion = {
      revision: 2,
      effectiveFrom: new Date('2026-10-05T18:00:00.000Z'),
      timezone: 'America/Toronto',
      businessHoursSnapshot: [
        {
          weekday: 0,
          openMinutes: 660,
          closeMinutes: 1260,
          isClosed: false,
        },
      ],
      holidaysSnapshot: [
        {
          date: '2026-12-25',
          name: 'Christmas',
          isClosed: true,
          openMinutes: null,
          closeMinutes: null,
        },
      ],
    };
    const prisma = {
      store: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'store-db-1',
          storeStableId: 'store-1',
        }),
      },
      storeOperatingHistoryState: {
        findUnique: jest.fn().mockResolvedValue({ trackingStartedAt }),
      },
      storeScheduleVersion: {
        findFirst: jest.fn().mockResolvedValue(activeVersion),
        findMany: jest.fn().mockResolvedValue([laterVersion]),
      },
      storeTemporaryClosureInterval: {
        findMany: jest.fn().mockResolvedValue([
          {
            startedAt: new Date('2026-10-05T15:00:00.000Z'),
            endedAt: new Date('2026-10-05T16:00:00.000Z'),
          },
        ]),
      },
    };
    const reader = new PrismaBrandStoreConfigReader(prisma as never);

    await expect(
      reader.readOperatingHistoryForRange(
        'store-1',
        fromInclusive,
        toExclusive,
      ),
    ).resolves.toEqual({
      storeStableId: 'store-1',
      coverage: { trackingStartedAt },
      scheduleVersions: [
        {
          revision: 1,
          effectiveFrom: trackingStartedAt,
          timezone: 'America/Toronto',
          businessHours: activeVersion.businessHoursSnapshot,
          holidays: [],
        },
        {
          revision: 2,
          effectiveFrom: laterVersion.effectiveFrom,
          timezone: 'America/Toronto',
          businessHours: laterVersion.businessHoursSnapshot,
          holidays: laterVersion.holidaysSnapshot,
        },
      ],
      temporaryClosures: [
        {
          startedAt: new Date('2026-10-05T15:00:00.000Z'),
          endedAt: new Date('2026-10-05T16:00:00.000Z'),
        },
      ],
    });

    expect(prisma.storeScheduleVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          storeDbId: 'store-db-1',
          effectiveFrom: { lte: fromInclusive },
        },
      }),
    );
    expect(prisma.storeScheduleVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          storeDbId: 'store-db-1',
          effectiveFrom: { gt: fromInclusive, lt: toExclusive },
        },
      }),
    );
  });

  it('returns null when forward-only Store history has not started', async () => {
    const prisma = {
      store: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'store-db-1',
          storeStableId: 'store-1',
        }),
      },
      storeOperatingHistoryState: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const reader = new PrismaBrandStoreConfigReader(prisma as never);

    await expect(
      reader.readOperatingHistoryForRange(
        'store-1',
        new Date('2026-10-01T04:00:00.000Z'),
        new Date('2026-10-02T04:00:00.000Z'),
      ),
    ).resolves.toBeNull();
  });
});
