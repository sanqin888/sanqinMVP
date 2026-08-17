import { PosConnectivityWatchdogService } from './pos-connectivity-watchdog.service';

const heartbeatMeta = { connectivityHeartbeatV1: true };

describe('PosConnectivityWatchdogService', () => {
  afterEach(() => jest.restoreAllMocks());

  function setup(lastSeenAt: Date) {
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
    const service = new PosConnectivityWatchdogService(
      prisma as never,
      uber as never,
    );
    return { service, prisma, uber };
  }

  it('does not write Uber status for a healthy first heartbeat snapshot', async () => {
    const { service, uber } = setup(new Date());

    await service.runOnce();

    expect(uber.syncStoreStatusToUber).not.toHaveBeenCalled();
  });

  it('pauses mapped Uber stores when the heartbeat is stale', async () => {
    const { service, uber } = setup(new Date(Date.now() - 120_000));

    await service.runOnce();

    expect(uber.syncStoreStatusToUber).toHaveBeenCalledWith({
      uberStoreId: 'uber-store-1',
      targetStatus: 'PAUSED',
      reason: 'POS connectivity lost',
    });
  });
});
