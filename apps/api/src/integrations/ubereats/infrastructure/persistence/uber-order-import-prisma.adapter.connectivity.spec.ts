import { UberOrderImportPrismaAdapter } from './uber-order-import-prisma.adapter';

describe('UberOrderImportPrismaAdapter POS connectivity', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads authoritative ONLINE connectivity from the POS-owned projection', async () => {
    const now = 1_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const findUnique = jest.fn().mockResolvedValue({
      hasHeartbeatCapableActiveDevice: true,
      lastHeartbeatAt: new Date(now),
      validUntil: new Date(now + 90_000),
    });
    const adapter = new UberOrderImportPrismaAdapter(
      { posConnectivityReadModel: { findUnique } } as never,
      {} as never,
      {} as never,
    );

    await expect(
      adapter.getStoreConnectivity('4750_Yonge_Street'),
    ).resolves.toEqual({
      status: 'ONLINE',
      lastHeartbeatAt: new Date(now),
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { storeStableId: '4750_Yonge_Street' },
      select: {
        hasHeartbeatCapableActiveDevice: true,
        lastHeartbeatAt: true,
        validUntil: true,
      },
    });
  });

  it.each([
    ['missing projection', null],
    [
      'no active order-receiving POS',
      {
        hasHeartbeatCapableActiveDevice: false,
        lastHeartbeatAt: null,
        validUntil: null,
      },
    ],
  ])('returns UNKNOWN for %s', async (_case, readModel) => {
    const adapter = new UberOrderImportPrismaAdapter(
      {
        posConnectivityReadModel: {
          findUnique: jest.fn().mockResolvedValue(readModel),
        },
      } as never,
      {} as never,
      {} as never,
    );

    await expect(
      adapter.getStoreConnectivity('another_store'),
    ).resolves.toEqual({ status: 'UNKNOWN', lastHeartbeatAt: null });
  });

  it.each([
    [
      'missing heartbeat timestamp',
      {
        hasHeartbeatCapableActiveDevice: true,
        lastHeartbeatAt: null,
        validUntil: null,
      },
      null,
    ],
    [
      'expired lease',
      {
        hasHeartbeatCapableActiveDevice: true,
        lastHeartbeatAt: new Date(800_000),
        validUntil: new Date(900_000),
      },
      new Date(800_000),
    ],
  ])('returns OFFLINE for %s', async (_case, readModel, lastHeartbeatAt) => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const adapter = new UberOrderImportPrismaAdapter(
      {
        posConnectivityReadModel: {
          findUnique: jest.fn().mockResolvedValue(readModel),
        },
      } as never,
      {} as never,
      {} as never,
    );

    await expect(
      adapter.getStoreConnectivity('4750_Yonge_Street'),
    ).resolves.toEqual({ status: 'OFFLINE', lastHeartbeatAt });
  });

  it('propagates projection read failure so the durable webhook inbox can retry', async () => {
    const failure = new Error('projection unavailable');
    const adapter = new UberOrderImportPrismaAdapter(
      {
        posConnectivityReadModel: {
          findUnique: jest.fn().mockRejectedValue(failure),
        },
      } as never,
      {} as never,
      {} as never,
    );

    await expect(
      adapter.getStoreConnectivity('4750_Yonge_Street'),
    ).rejects.toBe(failure);
  });
});
