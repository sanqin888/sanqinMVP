import {
  UberOpsTicketPriority,
  UberOpsTicketStatus,
  UberOpsTicketType,
} from '@prisma/client';
import {
  UberMerchantConnectionPrismaAdapter,
  UberOperationsAlertPrismaAdapter,
} from './uber-merchant-persistence.adapter';

describe('UberMerchantConnectionPrismaAdapter', () => {
  it('普通连接查询不会向 application model 暴露明文凭据', async () => {
    const prisma = {
      uberMerchantConnection: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'merchant-1',
          encryptedAccessToken: 'cipher-access',
          encryptedRefreshToken: 'cipher-refresh',
          expiresAt: null,
          scope: 'eats.store',
          tokenType: 'Bearer',
          connectedAt: new Date(),
          rawStoresSnapshot: null,
          updatedAt: new Date(),
        }),
      },
    };
    const vault = { decrypt: jest.fn(() => 'must-not-be-observed') };
    const adapter = new UberMerchantConnectionPrismaAdapter(
      prisma as never,
      vault as never,
    );

    const connection = await adapter.findConnection('merchant-1');

    expect(connection).not.toHaveProperty('accessToken');
    expect(connection).not.toHaveProperty('refreshToken');
    expect(vault.decrypt).not.toHaveBeenCalled();
  });

  it('OAuth 创建和 token refresh 只持久化加密凭据字段', async () => {
    type Mutation = {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    let mutation: Mutation | undefined;
    const upsert = jest.fn((value: Mutation) => {
      mutation = value;
      return Promise.resolve({
        connectedAt: new Date('2026-08-12T00:00:00.000Z'),
      });
    });
    const prisma = { uberMerchantConnection: { upsert } };
    const vault = {
      encrypt: jest.fn((value: string) => `encrypted:${value}`),
    };
    const adapter = new UberMerchantConnectionPrismaAdapter(
      prisma as never,
      vault as never,
    );

    await adapter.upsertConnectionByConnectionId({
      connectionId: 'merchant-1',
      accessToken: 'plain-access',
      refreshToken: 'plain-refresh',
      expiresAt: new Date('2026-08-12T01:00:00.000Z'),
      scope: 'eats.store',
      tokenType: 'Bearer',
      connectedAt: new Date('2026-08-12T00:00:00.000Z'),
    });

    if (!mutation) throw new Error('Expected an Uber credential upsert');
    for (const payload of [mutation.create, mutation.update]) {
      expect(payload).toMatchObject({
        encryptedAccessToken: 'encrypted:plain-access',
        encryptedRefreshToken: 'encrypted:plain-refresh',
      });
      expect(payload).not.toHaveProperty('accessToken');
      expect(payload).not.toHaveProperty('refreshToken');
    }
  });
});

describe('UberOperationsAlertPrismaAdapter store status alerts', () => {
  function setup(existingId: string | null) {
    const prisma = {
      uberOpsTicket: {
        findFirst: jest
          .fn()
          .mockResolvedValue(existingId ? { id: existingId } : null),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const adapter = new UberOperationsAlertPrismaAdapter(
      prisma as never,
      {} as never,
    );
    return { adapter, prisma };
  }

  it('updates an existing open alert for the same store status target instead of duplicating it', async () => {
    const { adapter, prisma } = setup('ticket-1');

    await adapter.createStoreStatusAlert(
      'uber-store-1',
      'bad request',
      'UPSTREAM_REJECTED',
      false,
      {
        status: 'OFFLINE',
        reason: 'POS connectivity lost',
        is_offline_until: '2026-08-26T03:30:00.000Z',
      },
    );

    expect(prisma.uberOpsTicket.findFirst).toHaveBeenCalledWith({
      where: {
        storeId: 'uber-store-1',
        type: UberOpsTicketType.STORE_STATUS_SYNC,
        status: {
          in: [UberOpsTicketStatus.OPEN, UberOpsTicketStatus.IN_PROGRESS],
        },
        OR: [
          {
            context: {
              path: ['targetStatus'],
              equals: 'PAUSED',
            },
          },
          {
            context: {
              path: ['targetStatus'],
              equals: 'OFFLINE',
            },
          },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    expect(prisma.uberOpsTicket.update).toHaveBeenCalledWith({
      where: { id: 'ticket-1' },
      data: {
        priority: UberOpsTicketPriority.HIGH,
        description: 'bad request',
        context: {
          uberStoreId: 'uber-store-1',
          targetStatus: 'PAUSED',
          reason: 'POS connectivity lost',
          pauseUntil: '2026-08-26T03:30:00.000Z',
          outcome: 'FAILED',
          failureReason: 'UPSTREAM_REJECTED',
          retryable: false,
        },
      },
    });
    expect(prisma.uberOpsTicket.create).not.toHaveBeenCalled();
  });

  it('creates a new alert when there is no matching open target alert', async () => {
    const { adapter, prisma } = setup(null);

    await adapter.createStoreStatusAlert(
      'uber-store-1',
      'upstream unavailable',
      'UPSTREAM_UNAVAILABLE',
      true,
      { status: 'ONLINE' },
    );

    expect(prisma.uberOpsTicket.update).not.toHaveBeenCalled();
    expect(prisma.uberOpsTicket.create).toHaveBeenCalledWith({
      data: {
        storeId: 'uber-store-1',
        type: UberOpsTicketType.STORE_STATUS_SYNC,
        status: UberOpsTicketStatus.OPEN,
        priority: UberOpsTicketPriority.HIGH,
        title: 'Uber 门店状态同步需要运营处理',
        description: 'upstream unavailable',
        context: {
          uberStoreId: 'uber-store-1',
          targetStatus: 'ONLINE',
          outcome: 'FAILED',
          failureReason: 'UPSTREAM_UNAVAILABLE',
          retryable: true,
        },
      },
    });
  });
});
