import { PrismaStoreScheduleAdapter } from './brand-store-config.reader';

const STORE = 'store-1';
const STORE_DB_ID = '00000000-0000-0000-0000-000000000001';

function snapshot(timezone = 'America/Toronto') {
  return {
    id: STORE_DB_ID,
    config: {
      timezone,
      isTemporarilyClosed: false,
      temporaryCloseReason: null,
    },
    businessHours: [
      {
        weekday: 1,
        openMinutes: 660,
        closeMinutes: 1260,
        isClosed: false,
      },
    ],
    holidays: [],
  };
}

describe('PrismaStoreScheduleAdapter history versioning', () => {
  it('does not create a schedule version for an identical BusinessHour replacement', async () => {
    const tx = {
      store: { findUnique: jest.fn().mockResolvedValue({ id: STORE_DB_ID }) },
      businessHour: {
        findMany: jest.fn().mockResolvedValue([
          {
            weekday: 1,
            openMinutes: 660,
            closeMinutes: 1260,
            isClosed: false,
          },
        ]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      storeOperatingHistoryState: {
        findUnique: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };
    const adapter = new PrismaStoreScheduleAdapter(prisma as never);

    await adapter.replaceBusinessHours(STORE, [
      {
        weekday: 1,
        openMinutes: 660,
        closeMinutes: 1260,
        isClosed: false,
      },
    ]);

    expect(tx.businessHour.deleteMany).not.toHaveBeenCalled();
    expect(tx.businessHour.createMany).not.toHaveBeenCalled();
    expect(tx.storeOperatingHistoryState.findUnique).not.toHaveBeenCalled();
  });

  it('writes changed BusinessHours and the new full snapshot in the same transaction', async () => {
    const storeFindUnique = jest
      .fn()
      .mockResolvedValueOnce({ id: STORE_DB_ID })
      .mockResolvedValueOnce(snapshot());
    const scheduleCreate = jest.fn().mockResolvedValue({});
    const tx = {
      store: { findUnique: storeFindUnique },
      businessHour: {
        findMany: jest.fn().mockResolvedValue([
          {
            weekday: 1,
            openMinutes: 600,
            closeMinutes: 1200,
            isClosed: false,
          },
        ]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      holiday: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      storeOperatingHistoryState: {
        findUnique: jest.fn().mockResolvedValue({ storeDbId: STORE_DB_ID }),
        update: jest.fn().mockResolvedValue({ scheduleRevision: 3 }),
      },
      storeScheduleVersion: { create: scheduleCreate },
    };
    const transaction = jest.fn(
      async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    );
    const adapter = new PrismaStoreScheduleAdapter({
      $transaction: transaction,
    } as never);

    await adapter.replaceBusinessHours(STORE, [
      {
        weekday: 1,
        openMinutes: 660,
        closeMinutes: 1260,
        isClosed: false,
      },
    ]);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.businessHour.deleteMany).toHaveBeenCalledWith({
      where: { storeDbId: STORE_DB_ID },
    });
    expect(tx.storeOperatingHistoryState.update).toHaveBeenCalledWith({
      where: { storeDbId: STORE_DB_ID },
      data: { scheduleRevision: { increment: 1 } },
      select: { scheduleRevision: true },
    });
    expect(scheduleCreate).toHaveBeenCalledWith({
      data: {
        storeDbId: STORE_DB_ID,
        revision: 3,
        effectiveFrom: expect.any(Date) as Date,
        timezone: 'America/Toronto',
        businessHoursSnapshot: [
          {
            weekday: 1,
            openMinutes: 660,
            closeMinutes: 1260,
            isClosed: false,
          },
        ],
        holidaysSnapshot: [],
      },
    });
  });
});
