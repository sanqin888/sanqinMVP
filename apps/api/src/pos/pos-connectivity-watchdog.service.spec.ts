import { PosConnectivityWatchdogService } from './pos-connectivity-watchdog.service';

const heartbeatMeta = { connectivityHeartbeatV1: true };
const NOW = 1_000_000;

describe('PosConnectivityWatchdogService', () => {
  afterEach(() => jest.restoreAllMocks());

  function setup(lastSeenAt: Date, isOpenBySchedule = true) {
    const prisma = {
      posDevice: {
        findMany: jest.fn().mockResolvedValue([
          { storeId: 'store-1', lastSeenAt, meta: heartbeatMeta },
        ]),
      },
      uberStoreMapping: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ uberStoreId: 'uber-store-1' }]),
      },
      businessConfig: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ isTemporarilyClosed: false }),
      },
    };
    const uber = {
      syncStoreStatusToUber: jest
        .fn()
        .mockResolvedValue({ outcome: 'SUCCEEDED', synchronizedStores: 1 }),
    };
    const storeStatus = {
      getCurrentStatus: jest.fn().mockResolvedValue({ isOpenBySchedule }),
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
      false,
    );

    await service.runOnce();

    expect(prisma.posDevice.findMany).not.toHaveBeenCalled();
    expect(uber.syncStoreStatusToUber).not.toHaveBeenCalled();
  });

  it('allows an opening grace period before evaluating heartbeat age', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
    const { service, uber } = setup(new Date(NOW - 120_000));

    await service.runOnce();
    expect(uber.syncStoreStatusToUber).not.toHaveBeenCalled();

    nowSpy.mockReturnValue(NOW + 90_001);
    await service.runOnce();

    expect(uber.syncStoreStatusToUber).toHaveBeenCalledWith({
      uberStoreId: 'uber-store-1',
      targetStatus: 'PAUSED',
      reason: 'POS connectivity lost',
    });
  });
});
