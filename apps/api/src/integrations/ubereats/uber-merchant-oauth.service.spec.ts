jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  Channel: { ubereats: 'ubereats' },
  FulfillmentType: { pickup: 'pickup', delivery: 'delivery' },
  OrderStatus: {
    pending: 'pending',
    paid: 'paid',
    making: 'making',
    ready: 'ready',
    completed: 'completed',
    cancelled: 'cancelled',
    refunded: 'refunded',
  },
  UberMenuPublishStatus: {
    SUBMITTED: 'SUBMITTED',
    SUCCEEDED: 'SUCCEEDED',
    FAILED: 'FAILED',
  },
  UberOpsTicketPriority: {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    CRITICAL: 'CRITICAL',
  },
  UberOpsTicketStatus: {
    OPEN: 'OPEN',
    IN_PROGRESS: 'IN_PROGRESS',
    RESOLVED: 'RESOLVED',
  },
  UberOpsTicketType: { STORE_STATUS_SYNC: 'STORE_STATUS_SYNC' },
  PaymentMethod: { UBEREATS: 'UBEREATS' },
}));

import { UberMerchantService } from './uber-merchant.service';
import { createUberMerchantService } from './uber-service-test.helpers';

describe('UberMerchantOAuthService', () => {
  const clientSecret = 'test-ubereats-secret';
  const createAuthService = () =>
    ({
      getAccessToken: jest.fn().mockResolvedValue('token_debug_1234567890'),
      forceRefreshAccessToken: jest
        .fn()
        .mockResolvedValue('token_debug_1234567890'),
      normalizeScopesToArray: jest.fn().mockImplementation((scope?: string) => {
        if (!scope?.trim()) {
          return ['eats.store.orders.read'];
        }

        return scope.trim().split(/\s+/).filter(Boolean);
      }),
      buildMerchantAuthorizeUrl: jest
        .fn()
        .mockResolvedValue(
          'https://auth.uber.com/oauth/v2/authorize?state=test',
        ),
      getMerchantRedirectUri: jest
        .fn()
        .mockReturnValue('https://example.com/oauth/callback'),
      exchangeAuthorizationCode: jest.fn().mockResolvedValue({
        accessToken: 'merchant_token_123',
        refreshToken: 'refresh_token_123',
        expiresAt: new Date('2026-03-19T01:00:00Z'),
        scope: 'eats.pos_provisioning',
        tokenType: 'Bearer',
      }),
      getMerchantIdentity: jest.fn().mockResolvedValue({ id: 'merchant_1' }),
    }) as unknown as ConstructorParameters<typeof UberMerchantService>[1];

  beforeEach(() => {
    process.env.UBER_EATS_CLIENT_SECRET = clientSecret;
    process.env.UBER_EATS_API_BASE_URL = 'https://api.uber.com';
    process.env.UBER_EATS_RESOURCE_HREF_ALLOWED_ORIGINS =
      'https://api.uber.com';
    process.env.UBER_EATS_WEBHOOK_SIGNING_KEY = clientSecret;
    process.env.UBER_EATS_OAUTH_STATE_SECRET =
      'high-entropy-test-secret-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.UBER_EATS_CLIENT_SECRET;
    delete process.env.UBER_EATS_WEBHOOK_SIGNING_KEY;
    delete process.env.UBER_EATS_API_BASE_URL;
    delete process.env.UBER_EATS_RESOURCE_HREF_ALLOWED_ORIGINS;
    delete process.env.UBER_EATS_OAUTH_STATE_SECRET;
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.WEB_BASE_URL;
    jest.restoreAllMocks();
  });

  describe('OAuth state 安全校验', () => {
    type StateRecord = {
      nonce: string;
      adminSessionId: string;
      redirectUri: string;
      merchantContext: string | null;
      issuedAt: Date;
      expiresAt: Date;
      consumedAt: Date | null;
    };

    const createStatePrisma = () => {
      const records = new Map<string, StateRecord>();
      return {
        records,
        prisma: {
          uberOAuthStateRequest: {
            create: jest.fn(
              ({ data }: { data: Omit<StateRecord, 'consumedAt'> }) => {
                records.set(data.nonce, { ...data, consumedAt: null });
              },
            ),
            findUnique: jest.fn(
              ({ where }: { where: { nonce: string } }) =>
                records.get(where.nonce) ?? null,
            ),
            updateMany: jest.fn(
              ({
                where,
                data,
              }: {
                where: {
                  nonce: string;
                  adminSessionId: string;
                  issuedAt: Date;
                  expiresAt: { gt: Date };
                  consumedAt: null;
                };
                data: { consumedAt: Date };
              }) => {
                const record = records.get(where.nonce);
                if (
                  !record ||
                  record.consumedAt ||
                  record.adminSessionId !== where.adminSessionId ||
                  record.issuedAt.getTime() !== where.issuedAt.getTime() ||
                  record.expiresAt <= where.expiresAt.gt
                )
                  return { count: 0 };
                record.consumedAt = data.consumedAt;
                return { count: 1 };
              },
            ),
            deleteMany: jest.fn(
              ({ where }: { where: { expiresAt: { lte: Date } } }) => {
                let count = 0;
                for (const [nonce, record] of records) {
                  if (record.expiresAt <= where.expiresAt.lte) {
                    records.delete(nonce);
                    count += 1;
                  }
                }
                return { count };
              },
            ),
          },
        },
      };
    };
    const stateInternals = (service: UberMerchantService) =>
      (service as unknown as { internal: unknown }).internal as {
        consumeOAuthState: (
          state: string,
          sessionId: string,
        ) => Promise<unknown>;
      };

    it('可由共享持久层上的另一个 service 实例消费，并保留上下文', async () => {
      const { prisma } = createStatePrisma();
      const issuer = createUberMerchantService(
        prisma as unknown as ConstructorParameters<
          typeof UberMerchantService
        >[0],
        createAuthService(),
      );
      const consumer = createUberMerchantService(
        prisma as unknown as ConstructorParameters<
          typeof UberMerchantService
        >[0],
        createAuthService(),
      );
      const issued = await issuer.buildMerchantAuthorizeUrl(
        'session_1',
        'merchant_1',
      );

      await expect(
        stateInternals(consumer).consumeOAuthState(issued.state, 'session_1'),
      ).resolves.toMatchObject({ merchantContext: 'merchant_1' });
    });

    it('拒绝过期与未来时间的 state，并在签发时清理过期记录', async () => {
      const { prisma, records } = createStatePrisma();
      const service = createUberMerchantService(
        prisma as unknown as ConstructorParameters<
          typeof UberMerchantService
        >[0],
        createAuthService(),
      );
      const nowSpy = jest.spyOn(Date, 'now');
      nowSpy.mockReturnValue(1_700_000_000_000);
      const expired = (await service.buildMerchantAuthorizeUrl('session_1'))
        .state;
      nowSpy.mockReturnValue(1_700_000_000_000 + 10 * 60 * 1000 + 1);
      await expect(
        stateInternals(service).consumeOAuthState(expired, 'session_1'),
      ).rejects.toThrow('OAuth state 已过期');

      const future = (await service.buildMerchantAuthorizeUrl('session_1'))
        .state;
      nowSpy.mockReturnValue(1_700_000_000_000);
      await expect(
        stateInternals(service).consumeOAuthState(future, 'session_1'),
      ).rejects.toThrow('OAuth state 时间戳来自未来');
      expect(records.size).toBe(1);
    });

    it('拒绝伪造、会话不匹配和二次使用的 state', async () => {
      const { prisma } = createStatePrisma();
      const service = createUberMerchantService(
        prisma as unknown as ConstructorParameters<
          typeof UberMerchantService
        >[0],
        createAuthService(),
      );
      const forged = (await service.buildMerchantAuthorizeUrl('session_1'))
        .state;
      await expect(
        stateInternals(service).consumeOAuthState(`${forged}x`, 'session_1'),
      ).rejects.toThrow('OAuth state 校验失败');

      const mismatched = (await service.buildMerchantAuthorizeUrl('session_1'))
        .state;
      await expect(
        stateInternals(service).consumeOAuthState(mismatched, 'session_2'),
      ).rejects.toThrow('OAuth state 与管理员会话不匹配');

      const oneTime = (await service.buildMerchantAuthorizeUrl('session_1'))
        .state;
      await expect(
        stateInternals(service).consumeOAuthState(oneTime, 'session_1'),
      ).resolves.toBeDefined();
      await expect(
        stateInternals(service).consumeOAuthState(oneTime, 'session_1'),
      ).rejects.toThrow('OAuth state 不存在或已使用');
    });

    it('并发消费时仅允许一个回调成功', async () => {
      const { prisma } = createStatePrisma();
      const serviceA = createUberMerchantService(
        prisma as unknown as ConstructorParameters<
          typeof UberMerchantService
        >[0],
        createAuthService(),
      );
      const serviceB = createUberMerchantService(
        prisma as unknown as ConstructorParameters<
          typeof UberMerchantService
        >[0],
        createAuthService(),
      );
      const state = (await serviceA.buildMerchantAuthorizeUrl('session_1'))
        .state;

      const results = await Promise.allSettled([
        stateInternals(serviceA).consumeOAuthState(state, 'session_1'),
        stateInternals(serviceB).consumeOAuthState(state, 'session_1'),
      ]);
      expect(
        results.filter(({ status }) => status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.filter(({ status }) => status === 'rejected'),
      ).toHaveLength(1);
    });
  });
});
