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

import { createHash, createHmac } from 'crypto';
import { toUberServiceAvailability, UberEatsService } from './ubereats.service';

const openSchedulePrisma = {
  businessConfig: {
    findUnique: jest
      .fn()
      .mockResolvedValue({ timezone: 'America/Toronto', salesTaxRate: 0.13 }),
  },
  businessHour: {
    findMany: jest
      .fn()
      .mockResolvedValue([
        { weekday: 1, openMinutes: 540, closeMinutes: 1080, isClosed: false },
      ]),
  },
};

const createNestedMenuPrisma = (templates: unknown[]) => ({
  ...openSchedulePrisma,
  menuCategory: {
    findMany: jest.fn().mockResolvedValue([
      {
        id: 1,
        stableId: 'cat_1',
        nameEn: 'Category',
        nameZh: '',
        sortOrder: 1,
        isActive: true,
      },
    ]),
  },
  menuItem: {
    findMany: jest.fn().mockResolvedValue([
      {
        id: 1,
        stableId: 'item_1',
        categoryId: 1,
        nameEn: 'Item',
        nameZh: '',
        basePriceCents: 1000,
        isAvailable: true,
        sortOrder: 1,
        optionGroups: [{ templateGroup: { stableId: 'meal' }, sortOrder: 1 }],
      },
    ]),
  },
  menuOptionGroupTemplate: { findMany: jest.fn().mockResolvedValue(templates) },
  uberItemChannelConfig: { findMany: jest.fn().mockResolvedValue([]) },
  uberOptionItemConfig: { findMany: jest.fn().mockResolvedValue([]) },
  uberModifierGroupConfig: { findMany: jest.fn().mockResolvedValue([]) },
  uberCategoryConfig: { findMany: jest.fn().mockResolvedValue([]) },
  uberOptionChildGroupBinding: { findMany: jest.fn().mockResolvedValue([]) },
  uberStoreMapping: {
    findFirst: jest.fn().mockResolvedValue({ uberStoreId: 'uber_store_1' }),
  },
  uberMenuPublishVersion: { create: jest.fn() },
  opsEvent: { create: jest.fn().mockResolvedValue(null) },
});

describe('toUberServiceAvailability', () => {
  const convert = (hours: Parameters<typeof toUberServiceAvailability>[0]) =>
    toUberServiceAvailability(hours, 'America/Toronto');

  it('保留门店时区下的普通本地时段', () => {
    expect(
      convert([
        { weekday: 1, openMinutes: 540, closeMinutes: 1080, isClosed: false },
      ]),
    ).toEqual([
      {
        day_of_week: 'MONDAY',
        time_periods: [{ start_time: '09:00', end_time: '18:00' }],
      },
    ]);
  });

  it('休息日和空配置不产生可售时段', () => {
    expect(
      convert([
        { weekday: 2, openMinutes: null, closeMinutes: null, isClosed: true },
      ]),
    ).toEqual([]);
    expect(convert([])).toEqual([]);
  });

  it('跨午夜时段拆分至相邻本地日期', () => {
    expect(
      convert([
        { weekday: 6, openMinutes: 1320, closeMinutes: 120, isClosed: false },
      ]),
    ).toEqual([
      {
        day_of_week: 'SUNDAY',
        time_periods: [{ start_time: '00:00', end_time: '02:00' }],
      },
      {
        day_of_week: 'SATURDAY',
        time_periods: [{ start_time: '22:00', end_time: '23:59' }],
      },
    ]);
  });

  it('同一天保留多个营业区间，并明确表达全天营业', () => {
    expect(
      convert([
        { weekday: 3, openMinutes: 480, closeMinutes: 720, isClosed: false },
        { weekday: 3, openMinutes: 1020, closeMinutes: 1260, isClosed: false },
        { weekday: 4, openMinutes: 0, closeMinutes: 0, isClosed: false },
      ]),
    ).toEqual([
      {
        day_of_week: 'WEDNESDAY',
        time_periods: [
          { start_time: '08:00', end_time: '12:00' },
          { start_time: '17:00', end_time: '21:00' },
        ],
      },
      {
        day_of_week: 'THURSDAY',
        time_periods: [{ start_time: '00:00', end_time: '23:59' }],
      },
    ]);
  });
});

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

  it('store.provisioned webhook 会回写门店 provision 状态', async () => {
    const rawBody = '{"event_type":"store.provisioned","store_id":"store_1"}';
    const signature = createHmac('sha256', clientSecret)
      .update(rawBody, 'utf8')
      .digest('hex');

    const prisma = {
      uberStoreMapping: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
        'x-event-id': 'evt_store_provisioned_1',
      },
      rawBody,
      body: {
        event_type: 'store.provisioned',
        store_id: 'store_1',
      },
    });

    expect(prisma.uberStoreMapping.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uberStoreId: 'store_1' },
      }),
    );
  });

  it('菜单成功通知会将已提交版本标记为最终成功', async () => {
    const rawBody = '{"event_type":"menus.notification"}';
    const signature = createHmac('sha256', clientSecret)
      .update(rawBody, 'utf8')
      .digest('hex');
    const prisma = {
      uberMenuPublishVersion: {
        findFirst: jest.fn().mockResolvedValue({ id: 'version_1' }),
        update: jest.fn().mockResolvedValue(null),
      },
      opsEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new UberEatsService(prisma as never, createAuthService());
    await service.handleWebhook({
      headers: { 'x-uber-signature': signature, 'x-event-id': 'menu_ok' },
      rawBody,
      body: {
        event_type: 'menus.notification',
        data: { store_id: 'uber_store_1', status: 'SUCCESS' },
      },
    });

    expect(prisma.uberMenuPublishVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'version_1' },
        data: expect.objectContaining({ status: 'SUCCEEDED' }) as unknown,
      }),
    );
  });

  it('菜单失败通知会保存 Uber 错误代码、字段路径和说明', async () => {
    const rawBody = '{"event_type":"menus.notification"}';
    const signature = createHmac('sha256', clientSecret)
      .update(rawBody, 'utf8')
      .digest('hex');
    const prisma = {
      uberMenuPublishVersion: {
        findFirst: jest.fn().mockResolvedValue({ id: 'version_2' }),
        update: jest.fn().mockResolvedValue(null),
      },
      opsEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new UberEatsService(prisma as never, createAuthService());
    await service.handleWebhook({
      headers: { 'x-uber-signature': signature, 'x-event-id': 'menu_failed' },
      rawBody,
      body: {
        event_type: 'menus.notification',
        data: {
          store_id: 'uber_store_1',
          status: 'FAILED',
          errors: [
            {
              code: 'INVALID_PRICE',
              field_path: 'items[0].price_info.price',
              description: 'price is invalid',
            },
          ],
        },
      },
    });

    expect(prisma.uberMenuPublishVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          errorDetails: [
            {
              code: 'INVALID_PRICE',
              path: 'items[0].price_info.price',
              message: 'price is invalid',
            },
          ],
        }) as unknown,
      }),
    );
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

    const service = new UberEatsService(prisma as never, createAuthService());
    const result = await service.getMerchantStores(undefined, 'merchant_1');

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

  it('获取商户门店列表时会识别 integration_enabled 并同步为已 provision', async () => {
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

    const service = new UberEatsService(prisma as never, createAuthService());
    const result = await service.getMerchantStores(undefined, 'merchant_1');

    expect(result.stores[0]?.isProvisioned).toBe(true);
    expect(result.stores[0]?.posExternalStoreId).toBe('client_1');

    const upsertCallArg = upsertMock.mock.calls[0]?.[0] as
      | { update?: Record<string, unknown> }
      | undefined;
    expect(upsertCallArg?.update).toMatchObject({
      isProvisioned: true,
      posExternalStoreId: 'client_1',
    });
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
      ...openSchedulePrisma,
      menuCategory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            stableId: 'cat_1',
            nameEn: 'Category 1',
            nameZh: '分类1',
            sortOrder: 1,
            isActive: true,
          },
        ]),
      },
      menuItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 101,
            stableId: 'm1',
            categoryId: 1,
            nameEn: 'Item 1',
            nameZh: '菜品1',
            basePriceCents: 1000,
            isAvailable: true,
            sortOrder: 1,
            ingredientsEn: 'Website description that should be overridden',
            optionGroups: [],
          },
          {
            id: 102,
            stableId: 'm2',
            categoryId: 1,
            nameEn: 'Item 2',
            nameZh: '菜品2',
            basePriceCents: 2000,
            isAvailable: true,
            sortOrder: 2,
            ingredientsEn: '  Website English description  ',
            optionGroups: [],
          },
          {
            id: 103,
            stableId: 'm3',
            categoryId: 1,
            nameEn: 'Item 3',
            nameZh: '菜品3',
            basePriceCents: 3000,
            isAvailable: true,
            sortOrder: 3,
            ingredientsEn: '   ',
            ingredientsZh: '仅有中文说明',
            optionGroups: [],
          },
        ]),
      },
      menuOptionGroupTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      uberItemChannelConfig: {
        findMany: jest.fn().mockResolvedValue([
          {
            menuItemStableId: 'm1',
            priceCents: 1200,
            isAvailable: false,
            displayDescription: '  Uber channel description  ',
          },
        ]),
      },
      uberOptionItemConfig: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      uberModifierGroupConfig: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      uberCategoryConfig: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      uberOptionChildGroupBinding: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      uberStoreMapping: {
        findFirst: jest.fn().mockResolvedValue({ uberStoreId: 'uber_store_1' }),
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
    expect(result.summary.totalItems).toBe(3);
    expect(result.summary.changedItems).toBe(1);
    const payload = result.payload as {
      menus: Array<{ service_availability: unknown }>;
      categories: Array<{
        entities: Array<{ id: string; type: 'ITEM' }>;
      }>;
      items: Array<{
        id: string;
        title: { translations: { en_us: string } };
        description?: { translations: { en_us: string } };
        tax_info: { tax_rate: number };
      }>;
    };
    expect(payload.menus[0].service_availability).toEqual([
      {
        day_of_week: 'MONDAY',
        time_periods: [{ start_time: '09:00', end_time: '18:00' }],
      },
    ]);
    expect(result.serviceAvailabilityTimezone).toBe('America/Toronto');
    const itemIds = new Set(payload.items.map((item) => item.id));
    expect(payload.items.every((item) => item.tax_info.tax_rate === 13)).toBe(
      true,
    );
    expect(
      payload.items.find((item) =>
        item.title.translations.en_us.startsWith('Item 1'),
      )?.description,
    ).toEqual({ translations: { en_us: 'Uber channel description' } });
    expect(
      payload.items.find((item) =>
        item.title.translations.en_us.startsWith('Item 2'),
      )?.description,
    ).toEqual({ translations: { en_us: 'Website English description' } });
    expect(
      payload.items.find((item) =>
        item.title.translations.en_us.startsWith('Item 3'),
      ),
    ).not.toHaveProperty('description');
    for (const category of payload.categories) {
      for (const entity of category.entities) {
        expect(typeof entity.id).toBe('string');
        expect(entity.type).toBe('ITEM');
        expect(itemIds.has(entity.id)).toBe(true);
      }
    }
    expect(prisma.menuItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          visibility: 'PUBLIC',
          publishToUberEats: true,
        },
      }),
    );
  });

  it('会将父选项与一个或多个必选子组展开为无嵌套的 Uber 合成项', async () => {
    const templates = [
      {
        stableId: 'meal',
        nameEn: 'Meal',
        nameZh: '',
        defaultMinSelect: 1,
        defaultMaxSelect: 1,
        isAvailable: true,
        sortOrder: 1,
        options: [
          {
            stableId: 'combo_a',
            nameEn: 'Combo A',
            nameZh: '',
            priceDeltaCents: 200,
            isAvailable: true,
            sortOrder: 1,
            childLinks: [
              { childOption: { templateGroup: { stableId: 'drink' } } },
              { childOption: { templateGroup: { stableId: 'size' } } },
            ],
          },
        ],
      },
      {
        stableId: 'drink',
        nameEn: 'Drink',
        nameZh: '',
        defaultMinSelect: 1,
        defaultMaxSelect: 1,
        isAvailable: true,
        sortOrder: 2,
        options: [
          {
            stableId: 'cola',
            nameEn: 'Cola',
            nameZh: '',
            priceDeltaCents: 100,
            isAvailable: true,
            sortOrder: 1,
            childLinks: [],
          },
        ],
      },
      {
        stableId: 'size',
        nameEn: 'Size',
        nameZh: '',
        defaultMinSelect: 1,
        defaultMaxSelect: 1,
        isAvailable: true,
        sortOrder: 3,
        options: [
          {
            stableId: 'medium',
            nameEn: 'Medium',
            nameZh: '',
            priceDeltaCents: 50,
            isAvailable: true,
            sortOrder: 1,
            childLinks: [],
          },
        ],
      },
    ];
    const prisma = createNestedMenuPrisma(templates);
    const service = new UberEatsService(prisma as never, createAuthService());

    const result = await service.publishUberMenu({
      storeId: 's1',
      dryRun: true,
    });
    const payload = result.payload as {
      items: Array<{
        id: string;
        title: { translations: { en_us: string } };
        modifier_group_ids: string[];
      }>;
      modifier_groups: Array<{ modifier_options: Array<{ id: string }> }>;
    };
    const referencedIds = new Set(
      payload.modifier_groups.flatMap((group) =>
        group.modifier_options.map((option) => option.id),
      ),
    );
    const referencedItems = payload.items.filter((item) =>
      referencedIds.has(item.id),
    );

    expect(referencedItems).not.toHaveLength(0);
    expect(
      referencedItems.every((item) => item.modifier_group_ids.length === 0),
    ).toBe(true);
    expect(
      referencedItems.some(
        (item) => item.title.translations.en_us === 'Combo A / Cola / Medium',
      ),
    ).toBe(true);
    expect(result.mappingErrors).toEqual([]);
  });

  it('拒绝将百分数格式的站内税率再次转换后发布到 Uber', async () => {
    const prisma = createNestedMenuPrisma([]);
    prisma.businessConfig.findUnique.mockResolvedValueOnce({
      timezone: 'America/Toronto',
      salesTaxRate: 13,
    });
    const service = new UberEatsService(prisma as never, createAuthService());

    await expect(
      service.publishUberMenu({ storeId: 's1', dryRun: true }),
    ).rejects.toThrow(
      'salesTaxRate 必须使用 0～1 的比例格式，例如 13% 应保存为 0.13',
    );
  });

  it('可选子组无法无损展开时会阻止正式发布', async () => {
    const templates = [
      {
        stableId: 'meal',
        nameEn: 'Meal',
        nameZh: '',
        defaultMinSelect: 1,
        defaultMaxSelect: 1,
        isAvailable: true,
        sortOrder: 1,
        options: [
          {
            stableId: 'combo_a',
            nameEn: 'Combo A',
            nameZh: '',
            priceDeltaCents: 200,
            isAvailable: true,
            sortOrder: 1,
            childLinks: [
              {
                childOption: { templateGroup: { stableId: 'optional_drink' } },
              },
            ],
          },
        ],
      },
      {
        stableId: 'optional_drink',
        nameEn: 'Optional drink',
        nameZh: '',
        defaultMinSelect: 0,
        defaultMaxSelect: 1,
        isAvailable: true,
        sortOrder: 2,
        options: [
          {
            stableId: 'cola',
            nameEn: 'Cola',
            nameZh: '',
            priceDeltaCents: 100,
            isAvailable: true,
            sortOrder: 1,
            childLinks: [],
          },
        ],
      },
    ];
    const prisma = createNestedMenuPrisma(templates);
    const service = new UberEatsService(prisma as never, createAuthService());
    const uberApiSpy = jest.spyOn(service as never, 'callUberApi');

    await expect(
      service.publishUberMenu({ storeId: 's1', dryRun: false }),
    ).rejects.toMatchObject({
      response: {
        mappingErrors: [
          {
            code: 'UBER_OPTIONAL_CHILD_GROUP_UNSUPPORTED',
          },
        ],
      },
    });
    expect(prisma.uberMenuPublishVersion.create).not.toHaveBeenCalled();
    expect(uberApiSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['被排除', false],
    ['停用', true],
  ])('%s必选子组会产生阻断性校验错误', async (_label, inactive) => {
    const templates = [
      {
        stableId: 'meal',
        nameEn: 'Meal',
        nameZh: '',
        defaultMinSelect: 1,
        defaultMaxSelect: 1,
        isAvailable: true,
        sortOrder: 1,
        options: [
          {
            stableId: 'combo',
            nameEn: 'Combo',
            nameZh: '',
            priceDeltaCents: 0,
            isAvailable: true,
            sortOrder: 1,
            childLinks: [
              { childOption: { templateGroup: { stableId: 'drink' } } },
            ],
          },
        ],
      },
      {
        stableId: 'drink',
        nameEn: 'Drink',
        nameZh: '',
        defaultMinSelect: 1,
        defaultMaxSelect: 1,
        isAvailable: !inactive,
        sortOrder: 2,
        options: [
          {
            stableId: 'cola',
            nameEn: 'Cola',
            nameZh: '',
            priceDeltaCents: 0,
            isAvailable: true,
            sortOrder: 1,
            childLinks: [],
          },
        ],
      },
    ];
    const prisma = createNestedMenuPrisma(templates);
    const service = new UberEatsService(prisma as never, createAuthService());
    const excludedGroupIds = inactive
      ? []
      : [
          `sanq:${createHash('sha1')
            .update('group:s1:drink')
            .digest('hex')
            .slice(0, 24)}`,
        ];

    await expect(
      service.publishUberMenu({
        storeId: 's1',
        dryRun: true,
        excludedGroupIds,
      }),
    ).rejects.toMatchObject({
      response: {
        validation: {
          errors: expect.arrayContaining([
            expect.objectContaining({ code: 'UBER_CHILD_GROUP_MISSING' }),
          ]) as unknown,
        },
      },
    });
  });

  it('归一化会删除空可选组和孤立模板，但阻止空必选组', () => {
    const service = new UberEatsService({} as never, createAuthService());
    const normalized = service.normalizeAndValidateUberMenuGraph({
      menuId: 'menu',
      categories: [{ id: 'cat', entities: ['dish'] }],
      items: [
        {
          id: 'dish',
          sourceType: 'MENU_ITEM',
          sourceStableId: 'dish_stable',
          isAvailable: true,
          modifierGroupIds: ['optional_empty', 'required_empty'],
        },
      ],
      groups: [
        {
          id: 'optional_empty',
          sourceStableId: 'optional_stable',
          minSelect: 0,
          maxSelect: 0,
          optionItemIds: [],
        },
        {
          id: 'required_empty',
          sourceStableId: 'required_stable',
          minSelect: 1,
          maxSelect: 1,
          optionItemIds: [],
        },
        {
          id: 'orphan',
          sourceStableId: 'orphan_stable',
          minSelect: 0,
          maxSelect: 1,
          optionItemIds: ['orphan_option'],
        },
      ],
      mappingErrors: [],
    });

    expect(normalized.graph.groups).toEqual([]);
    expect(normalized.graph.items[0].modifierGroupIds).toEqual([]);
    expect(normalized.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'UBER_EMPTY_GROUP_REMOVED' }),
      ]),
    );
    expect(normalized.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'UBER_REQUIRED_GROUP_EMPTY',
          itemStableId: 'dish_stable',
          groupStableId: 'required_stable',
        }),
      ]),
    );
  });

  it('剩余可选项少于 minSelect 时报错，不会篡改上限', () => {
    const service = new UberEatsService({} as never, createAuthService());
    const normalized = service.normalizeAndValidateUberMenuGraph({
      menuId: 'menu',
      categories: [{ id: 'cat', entities: ['dish'] }],
      items: [
        {
          id: 'dish',
          sourceType: 'MENU_ITEM',
          sourceStableId: 'dish_stable',
          isAvailable: true,
          modifierGroupIds: ['group'],
        },
        {
          id: 'available',
          sourceType: 'OPTION_ITEM',
          sourceStableId: 'a',
          isAvailable: true,
          modifierGroupIds: [],
        },
        {
          id: 'disabled',
          sourceType: 'OPTION_ITEM',
          sourceStableId: 'b',
          isAvailable: false,
          modifierGroupIds: [],
        },
      ],
      groups: [
        {
          id: 'group',
          sourceStableId: 'group_stable',
          minSelect: 2,
          maxSelect: 2,
          optionItemIds: ['available', 'disabled'],
        },
      ],
      mappingErrors: [],
    });

    expect(normalized.graph.groups[0]).toMatchObject({
      minSelect: 2,
      maxSelect: 2,
      optionItemIds: ['available'],
    });
    expect(normalized.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'UBER_GROUP_QUANTITY_INVALID' }),
      ]),
    );
  });

  it('悬空 category、group 和 option ID 都会被报告', () => {
    const service = new UberEatsService({} as never, createAuthService());
    const normalized = service.normalizeAndValidateUberMenuGraph({
      menuId: 'menu',
      categories: [{ id: 'cat', entities: ['dish', 'missing_dish'] }],
      items: [
        {
          id: 'dish',
          sourceType: 'MENU_ITEM',
          sourceStableId: 'dish_stable',
          isAvailable: true,
          modifierGroupIds: ['group', 'missing_group'],
        },
      ],
      groups: [
        {
          id: 'group',
          sourceStableId: 'group_stable',
          minSelect: 0,
          maxSelect: 1,
          optionItemIds: ['missing_option'],
        },
      ],
      mappingErrors: [],
    });

    expect(
      normalized.errors.map((error: { code: string }) => error.code),
    ).toEqual(
      expect.arrayContaining([
        'UBER_CATEGORY_ITEM_MISSING',
        'UBER_ITEM_GROUP_MISSING',
        'UBER_GROUP_OPTION_MISSING',
      ]),
    );
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

  describe('validateUberMenuPayload', () => {
    const validPayload = () => ({
      menus: [
        {
          id: 'menu',
          title: { translations: { en_us: 'Main' } },
          category_ids: ['cat'],
          service_availability: [
            {
              day_of_week: 'MONDAY',
              time_periods: [{ start_time: '09:00', end_time: '18:00' }],
            },
          ],
        },
      ],
      categories: [
        {
          id: 'cat',
          title: { translations: { en_us: 'Food' } },
          entities: [{ id: 'dish', type: 'ITEM' }],
        },
      ],
      items: [
        {
          id: 'dish',
          title: { translations: { en_us: 'Dish' } },
          price_info: { price: 100 },
          tax_info: { tax_rate: 13 },
          modifier_group_ids: ['group'],
          suspension_info: { suspended_until: null },
        },
        {
          id: 'option',
          title: { translations: { en_us: 'Option' } },
          price_info: { price: 0 },
          tax_info: { tax_rate: 13 },
          modifier_group_ids: [],
          suspension_info: { suspended_until: null },
        },
      ],
      modifier_groups: [
        {
          id: 'group',
          title: { translations: { en_us: 'Size' } },
          quantity_info: { quantity: { min_permitted: 1, max_permitted: 1 } },
          modifier_options: [{ id: 'option', type: 'ITEM' }],
        },
      ],
    });

    it('完整合法 payload 通过校验', () => {
      const service = new UberEatsService({} as never, createAuthService());
      expect(service.validateUberMenuPayload(validPayload() as never)).toEqual(
        [],
      );
    });

    it('合法公网 HTTPS 图片仅产生不可阻断的元数据 warning', () => {
      const payload = validPayload();
      (
        payload.items[0] as (typeof payload.items)[number] & {
          image_url?: string;
        }
      ).image_url = 'https://cdn.example.com/menu/dish.jpg';
      const service = new UberEatsService({} as never, createAuthService());
      expect(service.validateUberMenuPayload(payload as never)).toEqual([
        expect.objectContaining({
          code: 'UBER_IMAGE_METADATA_UNVERIFIED',
          severity: 'WARNING',
          path: '$.items[0].image_url',
        }),
      ]);
    });

    it('清理描述空白并按 Uber schema 限制截断过长描述', () => {
      const payload = validPayload();
      (
        payload.items[0] as (typeof payload.items)[number] & {
          description?: { translations: { en_us: string } };
        }
      ).description = {
        translations: { en_us: `  ${'a'.repeat(299)}  b  ` },
      };
      const service = new UberEatsService({} as never, createAuthService());

      expect(service.validateUberMenuPayload(payload as never)).toContainEqual(
        expect.objectContaining({
          code: 'UBER_DESCRIPTION_TRUNCATED',
          severity: 'WARNING',
          path: '$.items[0].description.translations.en_us',
        }),
      );
      expect(
        (
          payload.items[0] as (typeof payload.items)[number] & {
            description: { translations: { en_us: string } };
          }
        ).description.translations.en_us,
      ).toHaveLength(300);
    });

    it('从 payload 移除只有空白的描述', () => {
      const payload = validPayload();
      const item = payload.items[0] as (typeof payload.items)[number] & {
        description?: { translations: { en_us: string } };
      };
      item.description = { translations: { en_us: ' \n\t ' } };
      const service = new UberEatsService({} as never, createAuthService());

      expect(service.validateUberMenuPayload(payload as never)).toContainEqual(
        expect.objectContaining({
          code: 'UBER_DESCRIPTION_EMPTY_REMOVED',
          severity: 'WARNING',
        }),
      );
      expect(item.description).toBeUndefined();
    });

    it.each([
      'http://cdn.example.com/dish.jpg',
      'https://localhost/dish.jpg',
      'https://192.168.1.2/dish.jpg',
      'https://cdn.example.com/dish.jpg?expires=1234',
    ])('拒绝非永久公网图片地址 %s', (imageUrl) => {
      const payload = validPayload();
      (
        payload.items[0] as (typeof payload.items)[number] & {
          image_url?: string;
        }
      ).image_url = imageUrl;
      const service = new UberEatsService({} as never, createAuthService());
      expect(service.validateUberMenuPayload(payload as never)).toContainEqual(
        expect.objectContaining({
          code: 'UBER_IMAGE_URL_INVALID',
          severity: 'ERROR',
        }),
      );
    });

    it.each([
      [
        'UBER_ID_NOT_GLOBALLY_UNIQUE',
        (p: ReturnType<typeof validPayload>) => {
          p.categories[0].id = 'menu';
        },
      ],
      [
        'UBER_REFERENCE_UNRESOLVED',
        (p: ReturnType<typeof validPayload>) => {
          p.menus[0].category_ids = ['missing'];
        },
      ],
      [
        'UBER_CATEGORY_ENTITY_TYPE_INVALID',
        (p: ReturnType<typeof validPayload>) => {
          p.categories[0].entities[0].type = 'MODIFIER_GROUP';
        },
      ],
      [
        'UBER_MODIFIER_OPTION_TYPE_INVALID',
        (p: ReturnType<typeof validPayload>) => {
          p.modifier_groups[0].modifier_options[0].type = 'GROUP';
        },
      ],
      [
        'UBER_OPTION_ITEM_HAS_MODIFIER_GROUP',
        (p: ReturnType<typeof validPayload>) => {
          p.items[1].modifier_group_ids = ['group'];
        },
      ],
      [
        'UBER_TITLE_INVALID',
        (p: ReturnType<typeof validPayload>) => {
          p.items[0].title.translations.en_us = ' ';
        },
      ],
      [
        'UBER_PRICE_INVALID',
        (p: ReturnType<typeof validPayload>) => {
          p.items[0].price_info.price = -1;
        },
      ],
      [
        'UBER_GROUP_QUANTITY_INVALID',
        (p: ReturnType<typeof validPayload>) => {
          p.modifier_groups[0].quantity_info.quantity.max_permitted = 2;
        },
      ],
      [
        'UBER_MENU_CATEGORY_EMPTY',
        (p: ReturnType<typeof validPayload>) => {
          p.menus[0].category_ids = [];
        },
      ],
      [
        'UBER_CATEGORY_ITEM_EMPTY',
        (p: ReturnType<typeof validPayload>) => {
          p.categories[0].entities = [];
        },
      ],
      [
        'UBER_REQUIRED_GROUP_EMPTY',
        (p: ReturnType<typeof validPayload>) => {
          p.modifier_groups[0].modifier_options = [];
        },
      ],
      [
        'UBER_SERVICE_AVAILABILITY_INVALID',
        (p: ReturnType<typeof validPayload>) => {
          p.menus[0].service_availability[0].time_periods[0].end_time = '08:00';
        },
      ],
    ])('%s 约束失败时返回可定位的结构化错误', (code, mutate) => {
      const payload = validPayload();
      mutate(payload);
      const service = new UberEatsService({} as never, createAuthService());
      const issue = service
        .validateUberMenuPayload(payload as never)
        .find((entry) => entry.code === code);
      expect(issue).toEqual(
        expect.objectContaining({
          code,
          severity: 'ERROR',
          path: expect.stringMatching(/^\$/) as unknown,
          message: expect.any(String) as unknown,
        }),
      );
      expect(issue).toHaveProperty('sourceStableId');
    });
  });
});
