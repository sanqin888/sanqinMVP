import { UberMerchantConnectionPrismaAdapter } from './uber-merchant-persistence.adapter';

describe('UberMerchantConnectionPrismaAdapter', () => {
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

    await adapter.upsertConnectionByUberUserId({
      uberUserId: 'merchant-1',
      accessToken: 'plain-access',
      refreshToken: 'plain-refresh',
      expiresAt: new Date('2026-08-12T01:00:00.000Z'),
      scope: 'eats.store',
      tokenType: 'Bearer',
      connectedAt: new Date('2026-08-12T00:00:00.000Z'),
      rawStoresSnapshot: null,
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
