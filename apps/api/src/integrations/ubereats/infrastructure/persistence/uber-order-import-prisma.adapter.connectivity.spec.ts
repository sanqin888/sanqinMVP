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
    const adapter = new UberOrderImportPrismaAdapter(
      { posDevice: { findMany } } as never,
      {} as never,
    );

    await expect(
      adapter.getPosStoreConnectivity('4750_Yonge_Street'),
    ).resolves.toMatchObject({ status: 'ONLINE' });

    expect(findMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE' },
      select: { lastSeenAt: true, meta: true },
    });
  });

  it('does not read POS devices for an unrelated external store id', async () => {
    const findMany = jest.fn();
    const adapter = new UberOrderImportPrismaAdapter(
      { posDevice: { findMany } } as never,
      {} as never,
    );

    await expect(
      adapter.getPosStoreConnectivity('another_store'),
    ).resolves.toEqual({ status: 'UNKNOWN', lastHeartbeatAt: null });
    expect(findMany).not.toHaveBeenCalled();
  });
});
