import { PosConnectivityWatchdogService } from './pos-connectivity-watchdog.service';
import { PosStoreStatusService } from './pos-store-status.service';

const heartbeatMeta = { connectivityHeartbeatV1: true };
const NOW = Date.parse('2026-08-25T12:00:00.000Z');
const ORIGINAL_STORE_ID = process.env.STORE_ID;

const openSchedule = (
  date = '2026-08-25',
  overrides: Record<string, unknown> = {},
) => ({
  isOpenBySchedule: true,
  isTemporarilyClosed: false,
  timezone: 'America/Toronto',
  today: {
    date,
    closeMinutes: 23 * 60 + 30,
  },
  ...overrides,
});

const closedSchedule = (date = '2026-08-25') => ({
  isOpenBySchedule: false,
  isTemporarilyClosed: false,
  timezone: 'America/Toronto',
  today: {
    date,
    closeMinutes: 23 * 60 + 30,
  },
});

describe('PosConnectivityWatchdogService', () => {
  beforeEach(() => {
    process.env.STORE_ID = 'store-1';
  });

  afterEach(() => {
    if (ORIGINAL_STORE_ID === undefined) delete process.env.STORE_ID;
    else process.env.STORE_ID = ORIGINAL_STORE_ID;
    jest.restoreAllMocks();
  });

  function setup(lastSeenAt: Date, schedule = openSchedule()) {
    const prisma = {
      posDevice: {
        findMany: jest.fn().mockResolvedValue([
          {
            storeId: 'legacy-device-store-uuid',
            lastSeenAt,
            meta: heartbeatMeta,
          },
        ]),
      },
      uberStoreMapping: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ uberStoreId: 'uber-store-1' }]),
      },
      businessConfig: {
        findUnique: jest.fn().mockResolvedValue({ isTemporarilyClosed: false }),
      },
    };
    const uber = {
      syncStoreStatusToUber: jest
        .fn()
        .mockResolvedValue({ outcome: 'SUCCEEDED', synchronizedStores: 1 }),
    };
    const storeStatus = {
      getCurrentStatus: jest.fn().mockResolvedValue(schedule),
    };
    const service = new PosConnectivityWatchdogService(
      prisma as never,
      uber as never,
      storeStatus as never,
    );
    return { service, prisma, uber, storeStatus };
  }

  it('does not check connectivity while the store is closed by schedule', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    const { service, prisma, uber } = setup(
      new Date(NOW - 120_000),
      closedSchedule(),
    );

    await service.runOnce();

    expect(prisma.posDevice.findMany).not.toHaveBeenCalled();
    expect(uber.syncStoreStatusToUber).not.toHaveBeenCalled();
  });

  it('pauses Uber until the current business day closes after the opening grace period', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
    const { service, prisma, uber } = setup(new Date(NOW - 120_000));

    await service.runOnce();
    expect(uber.syncStoreStatusToUber).not.toHaveBeenCalled();

    nowSpy.mockReturnValue(NOW + 90_001);
    await service.runOnce();

    expect(prisma.uberStoreMapping.findMany).toHaveBeenCalledWith({
      where: { posExternalStoreId: 'store-1', isProvisioned: true },
      select: { uberStoreId: true },
    });
    expect(uber.syncStoreStatusToUber).toHaveBeenCalledWith({
      uberStoreId: 'uber-store-1',
      targetStatus: 'PAUSED',
      reason: 'POS connectivity lost',
      pauseUntil: '2026-08-26T03:30:00.000Z',
    });
  });

  it('does not overwrite an employee-selected temporary pause while POS is offline', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
    const { service, prisma, uber } = setup(
      new Date(NOW - 120_000),
      openSchedule('2026-08-25', { isTemporarilyClosed: true }),
    );

    await service.runOnce();
    nowSpy.mockReturnValue(NOW + 90_001);
    await service.runOnce();

    expect(prisma.posDevice.findMany).not.toHaveBeenCalled();
    expect(uber.syncStoreStatusToUber).not.toHaveBeenCalled();
  });

  it('re-evaluates a still-offline POS on the next business day', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
    const { service, uber, storeStatus } = setup(new Date(NOW - 120_000));

    await service.runOnce();
    nowSpy.mockReturnValue(NOW + 90_001);
    await service.runOnce();
    expect(uber.syncStoreStatusToUber).toHaveBeenCalledTimes(1);

    storeStatus.getCurrentStatus.mockResolvedValue(
      closedSchedule('2026-08-25'),
    );
    nowSpy.mockReturnValue(Date.parse('2026-08-26T04:00:00.000Z'));
    await service.runOnce();

    storeStatus.getCurrentStatus.mockResolvedValue(openSchedule('2026-08-26'));
    const nextOpening = Date.parse('2026-08-26T12:00:00.000Z');
    nowSpy.mockReturnValue(nextOpening);
    await service.runOnce();
    expect(uber.syncStoreStatusToUber).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(nextOpening + 90_001);
    await service.runOnce();

    expect(uber.syncStoreStatusToUber).toHaveBeenCalledTimes(2);
    expect(uber.syncStoreStatusToUber).toHaveBeenLastCalledWith({
      uberStoreId: 'uber-store-1',
      targetStatus: 'PAUSED',
      reason: 'POS connectivity lost',
      pauseUntil: '2026-08-27T03:30:00.000Z',
    });
  });
});

describe('PosStoreStatusService Uber pause synchronization', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-25T13:00:00.000Z')); // 09:00 Toronto
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function setup() {
    const prisma = {
      businessConfig: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          timezone: 'America/Toronto',
          isTemporarilyClosed: false,
          temporaryCloseReason: null,
        }),
        update: jest
          .fn()
          .mockImplementation(
            ({ data }: { data: { isTemporarilyClosed: boolean } }) =>
              Promise.resolve({
                isTemporarilyClosed: data.isTemporarilyClosed,
              }),
          ),
        create: jest.fn(),
      },
    };
    const posGateway = {
      publishCustomerOrderingStatusUpdate: jest.fn(),
    };
    const uber = {
      syncStoreStatusToUber: jest
        .fn()
        .mockResolvedValue({ outcome: 'SUCCEEDED', synchronizedStores: 1 }),
    };
    const service = new PosStoreStatusService(
      prisma as never,
      posGateway as never,
      uber as never,
    );
    return { service, prisma, posGateway, uber };
  }

  it.each<[number, string]>([
    [15, '2026-08-25T09:15:00-04:00'],
    [30, '2026-08-25T09:30:00-04:00'],
    [60, '2026-08-25T10:00:00-04:00'],
    [120, '2026-08-25T11:00:00-04:00'],
    [180, '2026-08-25T12:00:00-04:00'],
  ])(
    'stores the selected %i-minute resume time before synchronizing Uber',
    async (durationMinutes, expectedAutoResumeAt) => {
      const { service, prisma, posGateway, uber } = setup();

      await expect(
        service.pauseCustomerOrdering({ durationMinutes }),
      ).resolves.toEqual({
        isTemporarilyClosed: true,
        autoResumeAt: expectedAutoResumeAt,
      });

      expect(prisma.businessConfig.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          isTemporarilyClosed: true,
          temporaryCloseReason: `__AUTO_UNTIL__:${expectedAutoResumeAt}|`,
        },
      });
      expect(
        posGateway.publishCustomerOrderingStatusUpdate,
      ).toHaveBeenCalledWith({
        isTemporarilyClosed: true,
        autoResumeAt: expectedAutoResumeAt,
      });
      expect(uber.syncStoreStatusToUber).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps the existing until-tomorrow option on the same Uber sync path', async () => {
    const { service, prisma, uber } = setup();

    await expect(
      service.pauseCustomerOrdering({ untilTomorrow: true }),
    ).resolves.toEqual({
      isTemporarilyClosed: true,
      autoResumeAt: '2026-08-26T00:00:00-04:00',
    });

    expect(prisma.businessConfig.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        isTemporarilyClosed: true,
        temporaryCloseReason: '__AUTO_UNTIL__:2026-08-26T00:00:00-04:00|',
      },
    });
    expect(uber.syncStoreStatusToUber).toHaveBeenCalledTimes(1);
  });
});
