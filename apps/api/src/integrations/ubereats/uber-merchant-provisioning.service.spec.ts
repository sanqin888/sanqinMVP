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

describe('UberMerchantService 门店状态同步', () => {
  const auth = () =>
    ({
      getAccessToken: jest.fn().mockResolvedValue('status-token'),
    }) as unknown as ConstructorParameters<typeof UberMerchantService>[1];
  const mapping = (uberStoreId: string, isProvisioned = true) => ({
    merchantUberUserId: 'merchant_1',
    uberStoreId,
    storeName: uberStoreId,
    locationSummary: null,
    isProvisioned,
    provisionedAt: isProvisioned ? new Date() : null,
    posExternalStoreId: null,
  });
  const prisma = (
    mappings: ReturnType<typeof mapping>[],
    isTemporarilyClosed = true,
    temporaryCloseReason:
      | string
      | null = '__AUTO_UNTIL__:2026-08-03T12:00:00-04:00|厨房繁忙',
  ) => ({
    businessConfig: {
      findUnique: jest.fn().mockResolvedValue({
        isTemporarilyClosed,
        temporaryCloseReason,
        updatedAt: new Date(),
      }),
    },
    uberStoreMapping: {
      findMany: jest.fn().mockResolvedValue(mappings),
    },
    opsEvent: { create: jest.fn().mockResolvedValue({}) },
    uberOpsTicket: { create: jest.fn().mockResolvedValue({}) },
  });

  beforeEach(() => {
    process.env.UBER_EATS_OAUTH_STATE_SECRET =
      'high-entropy-test-secret-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    process.env.UBER_EATS_WEBHOOK_SIGNING_KEY = 'test-ubereats-secret';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.UBER_EATS_OAUTH_STATE_SECRET;
    delete process.env.UBER_EATS_WEBHOOK_SIGNING_KEY;
  });

  it('逐个同步多个门店，并在部分失败和未 provision 时返回失败明细及运营告警', async () => {
    const db = prisma([
      mapping('store_ok'),
      mapping('store_forbidden'),
      mapping('store_pending', false),
    ]);
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(
        new Response('{"message":"missing scope"}', { status: 403 }),
      );
    const service = createUberMerchantService(
      db as unknown as ConstructorParameters<typeof UberMerchantService>[0],
      auth(),
    );

    await expect(service.syncStoreStatusToUber()).resolves.toMatchObject({
      ok: false,
      total: 3,
      succeeded: 1,
      failed: 2,
      payload: {
        status: 'PAUSED',
        reason: '厨房繁忙',
        pause_until: '2026-08-03T16:00:00.000Z',
      },
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(db.opsEvent.create).toHaveBeenCalledTimes(3);
    expect(db.uberOpsTicket.create).toHaveBeenCalledTimes(2);
  });

  it('将 409 重复暂停视为已生效的幂等成功', async () => {
    const db = prisma([mapping('store_1')]);
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response('{"message":"already paused"}', { status: 409 }),
      );
    const service = createUberMerchantService(
      db as unknown as ConstructorParameters<typeof UberMerchantService>[0],
      auth(),
    );

    await expect(service.syncStoreStatusToUber()).resolves.toMatchObject({
      ok: true,
      results: [{ ok: true, duplicate: true, status: 409 }],
    });
    expect(db.uberOpsTicket.create).not.toHaveBeenCalled();
  });

  it('恢复营业时发送 ONLINE，并对 429 限次退避后保存成功', async () => {
    const db = prisma([mapping('store_1')], false, null);
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 429 }))
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const service = createUberMerchantService(
      db as unknown as ConstructorParameters<typeof UberMerchantService>[0],
      auth(),
    );

    await expect(service.syncStoreStatusToUber()).resolves.toMatchObject({
      ok: true,
      payload: { status: 'ONLINE' },
      results: [{ attempts: 3 }],
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const requestBody = fetchSpy.mock.calls[0]?.[1]?.body;
    expect(typeof requestBody).toBe('string');
    expect(JSON.parse(requestBody as string)).toEqual({
      status: 'ONLINE',
    });
  });
});

describe('UberMerchantProvisioningService', () => {
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

  it('provisionStore 会调用 Uber provision 接口并标记门店已激活', async () => {
    const fetchMock: jest.MockedFunction<typeof fetch> = jest.fn();
    fetchMock.mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          store_name: 'Main Store',
          pos_external_store_id: 'pos_1',
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
      },
      uberStoreMapping: {
        upsert: jest.fn().mockResolvedValue({
          isProvisioned: true,
          provisionedAt: new Date('2026-03-19T00:00:00Z'),
        }),
      },
      opsEvent: {
        create: jest.fn().mockResolvedValue(null),
      },
    };

    const service = createUberMerchantService(
      prisma as unknown as ConstructorParameters<typeof UberMerchantService>[0],
      createAuthService(),
    );
    const result = await service.provisionStore(
      'store_1',
      { pos_store_id: 'pos_1' },
      'merchant_1',
    );

    expect(result.ok).toBe(true);
    expect(result.isProvisioned).toBe(true);
    expect(prisma.uberStoreMapping.upsert).toHaveBeenCalled();
  });
});
