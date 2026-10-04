import {
  appendStoreScheduleVersion,
  finishStoreTemporaryClosure,
  initializeStoreOperatingHistory,
} from './store-operating-history.persistence';

describe('Store operating history persistence', () => {
  it('initializes one forward-only baseline with a full schedule and current closure only', async () => {
    const trackingStartedAt = new Date('2026-10-04T14:00:00.000Z');
    const createMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const storeFindUnique = jest.fn().mockResolvedValue({
      config: {
        timezone: 'America/Toronto',
        isTemporarilyClosed: true,
        temporaryCloseReason:
          '__AUTO_UNTIL__:2026-10-04T12:30:00-04:00|maintenance',
      },
      businessHours: [
        {
          weekday: 0,
          openMinutes: 600,
          closeMinutes: 1200,
          isClosed: false,
        },
      ],
      holidays: [
        {
          date: new Date('2026-12-25T00:00:00.000Z'),
          name: 'Christmas',
          isClosed: true,
          openMinutes: null,
          closeMinutes: null,
        },
      ],
    });
    const scheduleCreate = jest.fn().mockResolvedValue({});
    const closureCreate = jest.fn().mockResolvedValue({});
    const tx = {
      storeOperatingHistoryState: { createMany },
      store: { findUnique: storeFindUnique },
      storeScheduleVersion: { create: scheduleCreate },
      storeTemporaryClosureInterval: { create: closureCreate },
    };

    await expect(
      initializeStoreOperatingHistory(
        tx as never,
        'store-db-1',
        trackingStartedAt,
      ),
    ).resolves.toBe(true);
    await expect(
      initializeStoreOperatingHistory(
        tx as never,
        'store-db-1',
        new Date('2026-10-04T15:00:00.000Z'),
      ),
    ).resolves.toBe(false);

    expect(storeFindUnique).toHaveBeenCalledTimes(1);
    expect(scheduleCreate).toHaveBeenCalledWith({
      data: {
        storeDbId: 'store-db-1',
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
        holidaysSnapshot: [
          {
            date: '2026-12-25',
            name: 'Christmas',
            isClosed: true,
            openMinutes: null,
            closeMinutes: null,
          },
        ],
      },
    });
    expect(closureCreate).toHaveBeenCalledWith({
      data: {
        storeDbId: 'store-db-1',
        startedAt: trackingStartedAt,
        endedAt: new Date('2026-10-04T16:30:00.000Z'),
      },
    });
  });

  it('increments schedule revision and snapshots the complete post-change schedule at the real effective instant', async () => {
    const effectiveFrom = new Date('2026-10-04T17:23:45.000Z');
    const scheduleCreate = jest.fn().mockResolvedValue({});
    const tx = {
      storeOperatingHistoryState: {
        update: jest.fn().mockResolvedValue({ scheduleRevision: 4 }),
      },
      store: {
        findUnique: jest.fn().mockResolvedValue({
          config: {
            timezone: 'America/Vancouver',
            isTemporarilyClosed: false,
            temporaryCloseReason: null,
          },
          businessHours: [
            {
              weekday: 0,
              openMinutes: 660,
              closeMinutes: 1260,
              isClosed: false,
            },
          ],
          holidays: [],
        }),
      },
      storeScheduleVersion: { create: scheduleCreate },
    };

    await appendStoreScheduleVersion(tx as never, 'store-db-1', effectiveFrom);

    expect(tx.storeOperatingHistoryState.update).toHaveBeenCalledWith({
      where: { storeDbId: 'store-db-1' },
      data: { scheduleRevision: { increment: 1 } },
      select: { scheduleRevision: true },
    });
    expect(scheduleCreate).toHaveBeenCalledWith({
      data: {
        storeDbId: 'store-db-1',
        revision: 4,
        effectiveFrom,
        timezone: 'America/Vancouver',
        businessHoursSnapshot: [
          {
            weekday: 0,
            openMinutes: 660,
            closeMinutes: 1260,
            isClosed: false,
          },
        ],
        holidaysSnapshot: [],
      },
    });
  });

  it('shrinks a planned pause when staff resumes early', async () => {
    const update = jest.fn().mockResolvedValue({});
    const tx = {
      storeTemporaryClosureInterval: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'closure-1',
          endedAt: new Date('2026-10-04T16:00:00.000Z'),
        }),
        update,
      },
    };
    const actualResume = new Date('2026-10-04T15:15:00.000Z');

    await finishStoreTemporaryClosure(tx as never, 'store-db-1', actualResume);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'closure-1' },
      data: { endedAt: actualResume },
    });
  });

  it('does not count delayed reconciliation after the planned auto-resume instant', async () => {
    const plannedResume = new Date('2026-10-04T15:00:00.000Z');
    const update = jest.fn();
    const tx = {
      storeTemporaryClosureInterval: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'closure-1',
          endedAt: plannedResume,
        }),
        update,
      },
    };

    await finishStoreTemporaryClosure(
      tx as never,
      'store-db-1',
      new Date('2026-10-04T15:07:00.000Z'),
    );

    expect(update).not.toHaveBeenCalled();
  });
});
