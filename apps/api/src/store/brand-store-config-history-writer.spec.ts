import { PrismaBrandStoreConfigWriter } from './brand-store-config.reader';

const STORE = 'store-1';
const STORE_DB_ID = '00000000-0000-0000-0000-000000000001';

function buildWriter(options?: { closed?: boolean; timezone?: string }) {
  const current = {
    timezone: options?.timezone ?? 'America/Toronto',
    isTemporarilyClosed: options?.closed ?? false,
    temporaryCloseReason: options?.closed ? 'Maintenance' : null,
  };
  const intervalCreate = jest.fn().mockResolvedValue({});
  const scheduleCreate = jest.fn().mockResolvedValue({});
  const tx = {
    store: {
      findUnique: jest.fn().mockImplementation(() =>
        Promise.resolve({
          id: STORE_DB_ID,
          config: { storeId: STORE_DB_ID, ...current },
          businessHours: [
            {
              weekday: 1,
              openMinutes: 660,
              closeMinutes: 1260,
              isClosed: false,
            },
          ],
          holidays: [],
        }),
      ),
    },
    storeConfig: {
      update: jest.fn().mockImplementation(
        (input: {
          data: {
            timezone?: string;
            isTemporarilyClosed?: boolean;
            temporaryCloseReason?: string | null;
          };
        }) => {
          Object.assign(current, input.data);
          return Promise.resolve({ ...current });
        },
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    storeOperatingHistoryState: {
      findUnique: jest.fn().mockResolvedValue({
        storeDbId: STORE_DB_ID,
        trackingStartedAt: new Date('2026-10-04T14:00:00.000Z'),
      }),
      update: jest.fn().mockResolvedValue({ scheduleRevision: 2 }),
    },
    storeScheduleVersion: { create: scheduleCreate },
    storeTemporaryClosureInterval: {
      create: intervalCreate,
      findFirst: jest.fn().mockResolvedValue({
        id: 'closure-1',
        endedAt: null,
      }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const transaction = jest.fn(
    async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  );
  return {
    writer: new PrismaBrandStoreConfigWriter({
      $transaction: transaction,
    } as never),
    tx,
    transaction,
    intervalCreate,
    scheduleCreate,
  };
}

describe('PrismaBrandStoreConfigWriter history invariants', () => {
  it('versions a real Store timezone change with the complete post-change schedule', async () => {
    const { writer, tx, scheduleCreate } = buildWriter();

    await writer.updateStoreConfig(STORE, {
      timezone: 'America/Vancouver',
    });

    expect(tx.storeOperatingHistoryState.update).toHaveBeenCalledWith({
      where: { storeDbId: STORE_DB_ID },
      data: { scheduleRevision: { increment: 1 } },
      select: { scheduleRevision: true },
    });
    expect(scheduleCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeDbId: STORE_DB_ID,
        revision: 2,
        timezone: 'America/Vancouver',
        businessHoursSnapshot: [
          {
            weekday: 1,
            openMinutes: 660,
            closeMinutes: 1260,
            isClosed: false,
          },
        ],
        holidaysSnapshot: [],
      }),
    });
  });

  it('does not manufacture a schedule version when timezone is written unchanged', async () => {
    const { writer, tx, scheduleCreate } = buildWriter();

    await writer.updateStoreConfig(STORE, {
      timezone: 'America/Toronto',
    });

    expect(tx.storeConfig.update).toHaveBeenCalledTimes(1);
    expect(tx.storeOperatingHistoryState.update).not.toHaveBeenCalled();
    expect(scheduleCreate).not.toHaveBeenCalled();
  });

  it('rejects duplicate pause before mutating current state or history', async () => {
    const { writer, tx, intervalCreate } = buildWriter({ closed: true });

    await expect(
      writer.startTemporaryClosure(
        STORE,
        '__AUTO_UNTIL__:2026-10-04T12:00:00-04:00|',
      ),
    ).resolves.toBe(false);

    expect(tx.storeConfig.update).not.toHaveBeenCalled();
    expect(intervalCreate).not.toHaveBeenCalled();
  });

  it('keeps Store pause current-state and interval writes in one transaction', async () => {
    const { writer, tx, transaction, intervalCreate } = buildWriter();
    const historyFailure = new Error('closure history failed');
    intervalCreate.mockRejectedValue(historyFailure);

    await expect(
      writer.startTemporaryClosure(
        STORE,
        '__AUTO_UNTIL__:2026-10-04T12:00:00-04:00|',
      ),
    ).rejects.toBe(historyFailure);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.storeConfig.update).toHaveBeenCalledTimes(1);
    expect(intervalCreate).toHaveBeenCalledTimes(1);
  });
});
