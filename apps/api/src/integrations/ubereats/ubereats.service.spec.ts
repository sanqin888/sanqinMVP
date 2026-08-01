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

import { createHash, createHmac } from 'crypto';
import { UberEatsService } from './ubereats.service';

const createNestedMenuPrisma = (templates: unknown[]) => ({
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
            optionGroups: [],
          },
        ]),
      },
      menuOptionGroupTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      uberItemChannelConfig: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { menuItemStableId: 'm1', priceCents: 1200, isAvailable: false },
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
    expect(result.summary.totalItems).toBe(2);
    expect(result.summary.changedItems).toBe(1);
    const payload = result.payload as {
      categories: Array<{
        entities: Array<{ id: string; type: 'ITEM' }>;
      }>;
      items: Array<{ id: string }>;
    };
    const itemIds = new Set(payload.items.map((item) => item.id));
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

    const result = await service.publishUberMenu({
      storeId: 's1',
      dryRun: true,
      excludedGroupIds,
    });

    expect(result.validation.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'UBER_CHILD_GROUP_MISSING' }),
      ]),
    );
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
});
