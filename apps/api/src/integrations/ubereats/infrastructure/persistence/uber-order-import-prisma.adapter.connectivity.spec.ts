import { UberOrderImportPrismaAdapter } from './uber-order-import-prisma.adapter';

const ORIGINAL_STORE_ID = process.env.STORE_ID;

describe('UberOrderImportPrismaAdapter POS connectivity', () => {
  beforeEach(() => {
    process.env.STORE_ID = '4750_Yonge_Street';
  });

  afterEach(() => {
    if (ORIGINAL_STORE_ID === undefined) delete process.env.STORE_ID;
    else process.env.STORE_ID = ORIGINAL_STORE_ID;
    jest.restoreAllMocks();
  });

  it('queries active POS devices without passing the external store id to the UUID column', async () => {
    const now = 1_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const findMany = jest.fn().mockResolvedValue([
      {
        lastSeenAt: new Date(now),
        meta: { connectivityHeartbeatV1: true },
      },
    ]);
    const findUnique = jest.fn().mockResolvedValue({
      hasHeartbeatCapableActiveDevice: true,
      lastHeartbeatAt: new Date(now),
      validUntil: new Date(now + 90_000),
    });
    const adapter = new UberOrderImportPrismaAdapter(
      {
        posDevice: { findMany },
        posConnectivityReadModel: { findUnique },
      } as never,
      {} as never,
    );

    await expect(
      adapter.getPosStoreConnectivity('4750_Yonge_Street'),
    ).resolves.toMatchObject({ status: 'ONLINE' });

    expect(findMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE' },
      select: { lastSeenAt: true, meta: true },
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

  it('keeps legacy PosDevice connectivity authoritative when the shadow read model differs', async () => {
    const now = 1_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const findMany = jest.fn().mockResolvedValue([
      {
        lastSeenAt: new Date(now),
        meta: { connectivityHeartbeatV1: true },
      },
    ]);
    const findUnique = jest.fn().mockResolvedValue({
      hasHeartbeatCapableActiveDevice: true,
      lastHeartbeatAt: new Date(now - 120_000),
      validUntil: new Date(now - 30_000),
    });
    const adapter = new UberOrderImportPrismaAdapter(
      {
        posDevice: { findMany },
        posConnectivityReadModel: { findUnique },
      } as never,
      {} as never,
    );

    await expect(
      adapter.getPosStoreConnectivity('4750_Yonge_Street'),
    ).resolves.toEqual({
      status: 'ONLINE',
      lastHeartbeatAt: new Date(now),
    });
  });

  it('keeps legacy connectivity authoritative when the shadow read fails', async () => {
    const now = 1_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const findMany = jest.fn().mockResolvedValue([
      {
        lastSeenAt: new Date(now),
        meta: { connectivityHeartbeatV1: true },
      },
    ]);
    const adapter = new UberOrderImportPrismaAdapter(
      {
        posDevice: { findMany },
        posConnectivityReadModel: {
          findUnique: jest
            .fn()
            .mockRejectedValue(new Error('shadow unavailable')),
        },
      } as never,
      {} as never,
    );

    await expect(
      adapter.getPosStoreConnectivity('4750_Yonge_Street'),
    ).resolves.toEqual({
      status: 'ONLINE',
      lastHeartbeatAt: new Date(now),
    });
  });

  it('does not read POS connectivity persistence for an unrelated external store id', async () => {
    const findMany = jest.fn();
    const findUnique = jest.fn();
    const adapter = new UberOrderImportPrismaAdapter(
      {
        posDevice: { findMany },
        posConnectivityReadModel: { findUnique },
      } as never,
      {} as never,
    );

    await expect(
      adapter.getPosStoreConnectivity('another_store'),
    ).resolves.toEqual({ status: 'UNKNOWN', lastHeartbeatAt: null });
    expect(findMany).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });
});
