jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  Channel: { ubereats: 'ubereats' },
  OrderStatus: {
    pending: 'pending',
    paid: 'paid',
    making: 'making',
    ready: 'ready',
    completed: 'completed',
    cancelled: 'cancelled',
    refunded: 'refunded',
  },
  UberMenuPublishStatus: { SUCCESS: 'SUCCESS' },
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

import { createHmac } from 'crypto';
import { UberEatsService } from './ubereats.service';

describe('UberEatsService', () => {
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
      exchangeAuthorizationCode: jest.fn().mockResolvedValue({
        accessToken: 'merchant_token_123',
        refreshToken: 'refresh_token_123',
        expiresAt: new Date('2026-03-19T01:00:00Z'),
        scope: 'eats.pos_provisioning',
        tokenType: 'Bearer',
      }),
      getMerchantIdentity: jest.fn().mockResolvedValue({ id: 'merchant_1' }),
    }) as never;

  beforeEach(() => {
    process.env.UBER_EATS_CLIENT_SECRET = clientSecret;
  });

  afterEach(() => {
    delete process.env.UBER_EATS_CLIENT_SECRET;
    delete process.env.UBER_EATS_WEBHOOK_SIGNING_KEY;
    jest.restoreAllMocks();
  });

  it('当 client secret 校验失败时会回退使用 webhook signing key 校验', async () => {
    const rawBody = '{"event_type":"orders.accepted"}';
    process.env.UBER_EATS_CLIENT_SECRET = 'wrong-client-secret';
    process.env.UBER_EATS_WEBHOOK_SIGNING_KEY = 'fallback-webhook-key';

    const signature = createHmac('sha256', 'fallback-webhook-key')
      .update(rawBody, 'utf8')
      .digest('hex');

    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ orderStableId: 'ord_uber_2' }),
      },
      opsEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new UberEatsService(prisma as never, createAuthService());
    await expect(
      service.handleWebhook({
        headers: {
          'x-uber-signature': signature,
          'x-event-id': 'evt_456',
        },
        rawBody,
        body: {
          event_type: 'orders.accepted',
          order: {
            order_id: 'ue_456',
            subtotal_cents: 1000,
            tax_cents: 130,
            total_cents: 1130,
          },
        },
      }),
    ).resolves.toBeUndefined();

    expect(prisma.order.create).toHaveBeenCalled();
  });

  it('接收订单 webhook 时会写入 ubereats 订单并返回 orderStableId', async () => {
    const rawBody = '{"event_type":"orders.accepted"}';
    const signature = createHmac('sha256', clientSecret)
      .update(rawBody, 'utf8')
      .digest('hex');

    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ orderStableId: 'ord_uber_1' }),
      },
      opsEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new UberEatsService(prisma as never, createAuthService());
    await service.handleWebhook({
      headers: {
        'x-uber-signature': signature,
        'x-event-id': 'evt_123',
      },
      rawBody,
      body: {
        event_type: 'orders.accepted',
        order: {
          order_id: 'ue_123',
          subtotal_cents: 1000,
          tax_cents: 130,
          total_cents: 1130,
        },
      },
    });

    expect(prisma.order.findUnique).toHaveBeenCalled();
    expect(prisma.order.create).toHaveBeenCalled();
  });

  it('debugAccessToken 会返回请求 scope 与脱敏 token 信息', async () => {
    const service = new UberEatsService({} as never, createAuthService());

    await expect(service.debugAccessToken()).resolves.toEqual({
      ok: true,
      requestedScope: null,
      normalizedScope: 'eats.store.orders.read',
      tokenPrefix: 'token_debug_',
      tokenLength: 'token_debug_1234567890'.length,
      usedDefaultScopes: true,
      forceRefreshed: false,
      cached: 'cache_or_fetch',
    });
  });

  it('debugCreatedOrders 会返回请求 URL 与订单摘要且不暴露完整 token', async () => {
    const fetchMock: jest.MockedFunction<typeof fetch> = jest.fn();
    fetchMock.mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          orders: [
            {
              id: 'ord_1',
              current_state: 'CREATED',
              placed_at: '2026-03-19T00:00:00Z',
            },
          ],
        }),
      ),
    } as Response);
    global.fetch = fetchMock;

    const authService = createAuthService();

    const service = new UberEatsService({} as never, authService);

    await expect(service.debugCreatedOrders('store_1')).resolves.toEqual({
      ok: true,
      storeId: 'store_1',
      requestUrl: 'https://api.uber.com/v1/eats/stores/store_1/created-orders',
      tokenPrefix: 'token_debug_',
      tokenLength: 'token_debug_1234567890'.length,
      orderCount: 1,
      orders: [
        {
          id: 'ord_1',
          currentState: 'CREATED',
          placedAt: '2026-03-19T00:00:00Z',
        },
      ],
    });

    expect(authService.getAccessToken).toHaveBeenCalledWith(
      'eats.store.orders.read',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.uber.com/v1/eats/stores/store_1/created-orders',
      expect.anything(),
    );

    const [, requestInit] = fetchMock.mock.calls[0];
    expect(requestInit).toMatchObject({
      method: 'GET',
      headers: {
        Authorization: 'Bearer token_debug_1234567890',
      },
    });
  });

  it('debugCreatedOrders 在未传 storeId 时会回退到环境变量', async () => {
    process.env.UBER_EATS_STORE_ID = 'store_env';
    const fetchMock: jest.MockedFunction<typeof fetch> = jest.fn();
    fetchMock.mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(JSON.stringify({ orders: [] })),
    } as Response);
    global.fetch = fetchMock;

    const authService = createAuthService();

    const service = new UberEatsService({} as never, authService);

    await expect(service.debugCreatedOrders()).resolves.toMatchObject({
      ok: true,
      storeId: 'store_env',
      requestUrl:
        'https://api.uber.com/v1/eats/stores/store_env/created-orders',
      orderCount: 0,
    });
  });

  it('debugCreatedOrders 在缺少 storeId 时会直接报错', async () => {
    delete process.env.UBER_EATS_STORE_ID;
    const service = new UberEatsService({} as never, createAuthService());

    await expect(service.debugCreatedOrders()).rejects.toThrow(
      '缺少 storeId，请通过 query 传入或配置 UBER_EATS_STORE_ID',
    );
  });

  it('获取商户门店列表时会更新授权快照与门店映射', async () => {
    const fetchMock: jest.MockedFunction<typeof fetch> = jest.fn();
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
        upsert: jest.fn().mockResolvedValue({}),
      },
    };

    const service = new UberEatsService(prisma as never, createAuthService());
    const result = await service.getMerchantStores(undefined, 'merchant_1');

    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
    expect(prisma.uberMerchantConnection.update).toHaveBeenCalled();
    expect(prisma.uberStoreMapping.upsert).toHaveBeenCalled();
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

    const service = new UberEatsService(prisma as never, createAuthService());
    const result = await service.provisionStore(
      undefined,
      'store_1',
      { pos_store_id: 'pos_1' },
      'merchant_1',
    );

    expect(result.ok).toBe(true);
    expect(result.isProvisioned).toBe(true);
    expect(prisma.uberStoreMapping.upsert).toHaveBeenCalled();
  });

  it('同步订单状态时，找不到订单会返回失败', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      opsEvent: {
        create: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new UberEatsService(prisma as never, createAuthService());
    const result = await service.syncOrderStatusToUber('ue_not_found', 'ready');

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('ORDER_NOT_FOUND');
  });

  it('发布菜单 dry-run 会返回差异统计并记录事件', async () => {
    const prisma = {
      menuItem: {
        findMany: jest.fn().mockResolvedValue([
          { stableId: 'm1', basePriceCents: 1000, isAvailable: true },
          { stableId: 'm2', basePriceCents: 2000, isAvailable: true },
        ]),
      },
      uberPriceBookItem: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { menuItemStableId: 'm1', priceCents: 1200, isAvailable: false },
          ]),
      },
      opsEvent: {
        create: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new UberEatsService(prisma as never, createAuthService());
    const result = await service.publishUberMenu({
      storeId: 's1',
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.totalItems).toBe(2);
    expect(result.changedItems).toBe(1);
  });

  it('生成自动对账报表时会汇总订单与失败事件', async () => {
    const prisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([
          { status: 'paid', totalCents: 1000 },
          { status: 'pending', totalCents: 500 },
        ]),
      },
      opsEvent: {
        count: jest.fn().mockResolvedValue(2),
        create: jest.fn().mockResolvedValue(null),
      },
      uberOpsTicket: {
        count: jest.fn().mockResolvedValue(1),
      },
      uberReconciliationReport: {
        create: jest.fn().mockResolvedValue({
          reportStableId: 'rep_1',
          createdAt: new Date('2026-01-01T00:00:00Z'),
        }),
      },
    };

    const service = new UberEatsService(prisma as never, createAuthService());
    const result = await service.generateReconciliationReport({
      storeId: 'default',
    });

    expect(result.ok).toBe(true);
    expect(result.totalOrders).toBe(2);
    expect(result.totalAmountCents).toBe(1500);
    expect(result.failedSyncEvents).toBe(2);
    expect(result.discrepancyOrders).toBe(1);
  });

  it('重试工单成功后会更新为已解决', async () => {
    const prisma = {
      uberOpsTicket: {
        findUnique: jest.fn().mockResolvedValue({
          ticketStableId: 'tic_1',
          type: 'STORE_STATUS_SYNC',
          storeId: 'default',
        }),
        update: jest
          .fn()
          .mockResolvedValueOnce({})
          .mockResolvedValueOnce({
            ticketStableId: 'tic_1',
            status: 'RESOLVED',
            retryCount: 1,
            lastError: null,
            resolvedAt: new Date('2026-01-01T00:00:00Z'),
          }),
      },
      businessConfig: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          isTemporarilyClosed: false,
          temporaryCloseReason: null,
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        }),
      },
      opsEvent: {
        create: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new UberEatsService(prisma as never, createAuthService());
    await expect(service.retryOpsTicket('tic_1')).resolves.toMatchObject({
      ok: true,
      status: 'RESOLVED',
    });
  });

  it('创建异常工单时会按默认优先级落库', async () => {
    const prisma = {
      uberOpsTicket: {
        create: jest.fn().mockResolvedValue({
          ticketStableId: 'tic_2',
          status: 'OPEN',
          priority: 'MEDIUM',
          createdAt: new Date('2026-01-01T00:00:00Z'),
        }),
      },
      opsEvent: {
        create: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new UberEatsService(prisma as never, createAuthService());
    await expect(
      service.createOpsTicket({
        type: 'STORE_STATUS_SYNC',
        title: '门店状态同步失败',
        storeId: 'default',
      }),
    ).resolves.toMatchObject({
      ok: true,
      priority: 'MEDIUM',
    });
  });
});
