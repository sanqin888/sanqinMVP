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
import { createUberMerchantService } from '../../uber-service-test.helpers';

describe('UberMerchantStoreMappingService', () => {
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

  it('获取商户门店列表时会更新授权快照，且不覆盖 provision 状态', async () => {
    const fetchMock: jest.MockedFunction<typeof fetch> = jest.fn();
    const upsertMock = jest
      .fn<Promise<Record<string, never>>, [unknown]>()
      .mockResolvedValue({});
    fetchMock.mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          stores: [
            {
              store_id: 'store_1',
              name: 'Main Store',
              location: { city: 'Toronto', country: 'CA' },
            },
          ],
        }),
      ),
    } as Response);
    global.fetch = fetchMock;

    const prisma = {
      uberMerchantConnection: {
        findUnique: jest.fn().mockResolvedValue({
          merchantUberUserId: 'merchant_1',
          accessToken: 'merchant_token_123',
        }),
        update: jest.fn().mockResolvedValue(null),
      },
      uberStoreMapping: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: upsertMock,
      },
    };

    const service = createUberMerchantService(
      prisma as unknown as ConstructorParameters<typeof UberMerchantService>[0],
      createAuthService(),
    );
    const result = await service.getMerchantStores('merchant_1');

    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
    expect(prisma.uberMerchantConnection.update).toHaveBeenCalled();
    const upsertCallArg = upsertMock.mock.calls[0]?.[0] as
      | { update?: Record<string, unknown> }
      | undefined;
    expect(upsertCallArg).toBeDefined();
    expect(upsertCallArg?.update).toBeDefined();
    expect(upsertCallArg?.update).not.toHaveProperty('isProvisioned');
  });

  it('获取商户门店列表时识别 provision 状态但不覆盖本地 POS 门店映射', async () => {
    const fetchMock: jest.MockedFunction<typeof fetch> = jest.fn();
    const upsertMock = jest
      .fn<Promise<Record<string, never>>, [unknown]>()
      .mockResolvedValue({});
    fetchMock.mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          stores: [
            {
              store_id: 'store_1',
              name: 'Main Store',
              location: { city: 'Toronto', country: 'CA' },
              pos_data: {
                integration_enabled: true,
                order_manager_client_id: 'client_1',
              },
            },
          ],
        }),
      ),
    } as Response);
    global.fetch = fetchMock;

    const prisma = {
      uberMerchantConnection: {
        findUnique: jest.fn().mockResolvedValue({
          merchantUberUserId: 'merchant_1',
          accessToken: 'merchant_token_123',
        }),
        update: jest.fn().mockResolvedValue(null),
      },
      uberStoreMapping: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: upsertMock,
      },
    };

    const service = createUberMerchantService(
      prisma as unknown as ConstructorParameters<typeof UberMerchantService>[0],
      createAuthService(),
    );
    const result = await service.getMerchantStores('merchant_1');

    expect(result.stores[0]?.isProvisioned).toBe(true);
    expect(result.stores[0]?.posExternalStoreId).toBe('client_1');

    const upsertCallArg = upsertMock.mock.calls[0]?.[0] as
      | { update?: Record<string, unknown> }
      | undefined;
    expect(upsertCallArg?.update).toMatchObject({
      isProvisioned: true,
    });
    expect(upsertCallArg?.update).not.toHaveProperty('posExternalStoreId');
    expect(upsertCallArg?.create).toMatchObject({
      posExternalStoreId: 'client_1',
    });
  });

  it('管理员更新 POS 门店映射时会规范化输入并记录审计事件', async () => {
    const mapping = {
      merchantUberUserId: 'merchant_1',
      uberStoreId: 'uber_store_1',
      storeName: 'Main Store',
      locationSummary: 'Toronto, CA',
      isProvisioned: true,
      provisionedAt: new Date(),
      posExternalStoreId: 'uber_client_id',
    };
    const update = jest.fn().mockResolvedValue({
      ...mapping,
      posExternalStoreId: '4750_Yonge_Street',
    });
    const prisma = {
      uberStoreMapping: {
        findUnique: jest.fn().mockResolvedValue(mapping),
        update,
      },
      opsEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = createUberMerchantService(
      prisma as unknown as ConstructorParameters<typeof UberMerchantService>[0],
      createAuthService(),
    );

    await expect(
      service.updatePosExternalStoreId(' uber_store_1 ', ' 4750_Yonge_Street '),
    ).resolves.toEqual({
      ok: true,
      storeId: 'uber_store_1',
      posExternalStoreId: '4750_Yonge_Street',
    });
    expect(update).toHaveBeenCalledWith({
      where: { uberStoreId: 'uber_store_1' },
      data: { posExternalStoreId: '4750_Yonge_Street' },
    });
    expect(prisma.opsEvent.create).toHaveBeenCalledWith({
      data: {
        eventName: 'ubereats_pos_store_mapping_updated',
        source: 'ubereats',
        payload: {
          uberStoreId: 'uber_store_1',
          previousPosExternalStoreId: 'uber_client_id',
          posExternalStoreId: '4750_Yonge_Street',
        },
      },
    });
  });

  it('拒绝更新不存在或格式无效的 POS 门店映射', async () => {
    const prisma = {
      uberStoreMapping: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = createUberMerchantService(
      prisma as unknown as ConstructorParameters<typeof UberMerchantService>[0],
      createAuthService(),
    );

    await expect(
      service.updatePosExternalStoreId('uber_store_1', 'invalid room'),
    ).rejects.toThrow('POS External Store ID 只能包含');
    await expect(
      service.updatePosExternalStoreId('missing_store', 'valid_store'),
    ).rejects.toThrow('Uber 门店映射不存在');
  });
});
