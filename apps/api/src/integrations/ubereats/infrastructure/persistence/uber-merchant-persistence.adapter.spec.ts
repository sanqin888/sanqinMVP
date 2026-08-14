import { UberMerchantConnectionPrismaAdapter } from './uber-merchant-persistence.adapter';

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
