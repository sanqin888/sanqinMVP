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

import { createHash } from 'crypto';
import {
  resolveUberImageUrl,
  toUberServiceAvailability,
} from './uber-integration.base';
import { UberMenuService } from './uber-menu.service';

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

describe('syncUberMenuItemAvailability', () => {
  beforeEach(() => {
    process.env.UBER_EATS_OAUTH_STATE_SECRET =
      'high-entropy-test-secret-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    process.env.UBER_EATS_WEBHOOK_SIGNING_KEY = 'test-ubereats-secret';
  });

  afterEach(() => jest.restoreAllMocks());

  function subject(configs: Array<Record<string, unknown>>) {
    const prisma = {
      menuItem: {
        findUnique: jest.fn().mockResolvedValue({ stableId: 'dish-1' }),
      },
      uberItemChannelConfig: {
        findMany: jest.fn().mockResolvedValue(configs),
        update: jest.fn().mockResolvedValue({}),
      },
      uberStoreMapping: {
        findMany: jest.fn().mockResolvedValue([
          { posExternalStoreId: 'pos-1', uberStoreId: 'uber-1' },
          { posExternalStoreId: 'pos-2', uberStoreId: 'uber-2' },
        ]),
      },
      uberOpsTicket: { create: jest.fn().mockResolvedValue({}) },
      opsEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new UberMenuService(
      prisma as unknown as ConstructorParameters<typeof UberMenuService>[0],
      {} as unknown as ConstructorParameters<typeof UberMenuService>[0],
    );
    return { prisma, service };
  }

  it.each([
    ['当日售罄', false],
    ['永久下架', false],
    ['恢复销售', true],
  ])('%s 会保存状态并提交可靠的菜单发布任务', async (_name, available) => {
    const { prisma, service } = subject([
      { storeId: 'pos-1', uberStoreId: 'uber-1', externalItemId: 'item-1' },
    ]);
    jest.spyOn(service, 'publishUberMenu').mockResolvedValue({
      versionStableId: 'version-1',
    } as unknown as ConstructorParameters<typeof UberMenuService>[0]);

    const result = await service.syncUberMenuItemAvailability({
      menuItemStableId: 'dish-1',
      isAvailable: available,
    });

    expect(result.status).toBe('PENDING');
    expect(prisma.uberItemChannelConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isAvailable: available } }),
    );
  });

  it('未配置 Uber 商品时明确跳过，而不使用 default 门店', async () => {
    const { prisma, service } = subject([]);
    const result = await service.syncUberMenuItemAvailability({
      menuItemStableId: 'dish-1',
      isAvailable: false,
    });
    expect(result).toEqual({ status: 'SKIPPED_NOT_PUBLISHED', stores: [] });
    expect(prisma.uberItemChannelConfig.findMany).toHaveBeenCalledWith({
      where: { menuItemStableId: 'dish-1' },
    });
  });

  it('上游失败会返回 FAILED 并保留可重试运营工单', async () => {
    const { prisma, service } = subject([
      { storeId: 'pos-1', uberStoreId: 'uber-1', externalItemId: 'item-1' },
    ]);
    jest
      .spyOn(service, 'publishUberMenu')
      .mockRejectedValue(new Error('upstream'));
    const result = await service.syncUberMenuItemAvailability({
      menuItemStableId: 'dish-1',
      isAvailable: false,
    });
    expect(result.status).toBe('FAILED');
    expect(prisma.uberOpsTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastError: 'upstream' }) as unknown,
      }),
    );
  });

  it('多门店会向每个已 provision 的商品映射分别发布', async () => {
    const { service } = subject([
      { storeId: 'pos-1', uberStoreId: 'uber-1', externalItemId: 'item-1' },
      { storeId: 'pos-2', uberStoreId: 'uber-2', externalItemId: 'item-2' },
    ]);
    const publish = jest.spyOn(service, 'publishUberMenu').mockResolvedValue({
      versionStableId: 'version',
    } as unknown as ConstructorParameters<typeof UberMenuService>[0]);
    const result = await service.syncUberMenuItemAvailability({
      menuItemStableId: 'dish-1',
      isAvailable: true,
    });
    expect(result.stores).toHaveLength(2);
    expect(publish).toHaveBeenCalledTimes(2);
  });
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
        day_of_week: 'monday',
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
        day_of_week: 'sunday',
        time_periods: [{ start_time: '00:00', end_time: '02:00' }],
      },
      {
        day_of_week: 'saturday',
        time_periods: [{ start_time: '22:00', end_time: '24:00' }],
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
        day_of_week: 'wednesday',
        time_periods: [
          { start_time: '08:00', end_time: '12:00' },
          { start_time: '17:00', end_time: '21:00' },
        ],
      },
      {
        day_of_week: 'thursday',
        time_periods: [{ start_time: '00:00', end_time: '24:00' }],
      },
    ]);
  });

  it('正确将周日跨午夜时段拆分到下周一', () => {
    expect(
      convert([
        { weekday: 0, openMinutes: 1380, closeMinutes: 60, isClosed: false },
      ]),
    ).toEqual([
      {
        day_of_week: 'sunday',
        time_periods: [{ start_time: '23:00', end_time: '24:00' }],
      },
      {
        day_of_week: 'monday',
        time_periods: [{ start_time: '00:00', end_time: '01:00' }],
      },
    ]);
  });
});

describe('UberMenuService', () => {
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
    }) as unknown as ConstructorParameters<typeof UberMenuService>[1];

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

    const service = new UberMenuService(
      prisma as unknown as ConstructorParameters<typeof UberMenuService>[0],
      createAuthService(),
    );
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
        day_of_week: 'monday',
        time_periods: [{ start_time: '09:00', end_time: '18:00' }],
      },
    ]);
    expect(result.serviceAvailabilityTimezone).toBe('America/Toronto');
    expect(result.taxRate).toEqual({
      percentage: 13,
      source: 'BusinessConfig.salesTaxRate',
      requiresAdminConfirmation: true,
      confirmed: false,
    });
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
    const service = new UberMenuService(
      prisma as unknown as ConstructorParameters<typeof UberMenuService>[0],
      createAuthService(),
    );

    const result = await service.publishUberMenu({
      storeId: 's1',
      dryRun: true,
    });
    const payload = result.payload as {
      items: Array<{
        id: string;
        title: { translations: { en_us: string } };
        modifier_group_ids: { ids: string[] | null; overrides: [] };
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
      referencedItems.every(
        (item) => (item.modifier_group_ids.ids?.length ?? 0) === 0,
      ),
    ).toBe(true);
    expect(
      referencedItems.some(
        (item) => item.title.translations.en_us === 'Combo A / Cola / Medium',
      ),
    ).toBe(true);
    expect(result.mappingErrors).toEqual([]);
    expect(result.modifierFlattening.combinations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourcePath: ['combo_a', 'cola', 'medium'],
          combinedPriceCents: 350,
        }),
      ]),
    );
  });

  it('正式发布要求管理员明确确认 dry-run 中展示的门店税率', async () => {
    const prisma = createNestedMenuPrisma([]);
    const service = new UberMenuService(
      prisma as unknown as ConstructorParameters<typeof UberMenuService>[0],
      createAuthService(),
    );

    await expect(
      service.publishUberMenu({ storeId: 's1', dryRun: false }),
    ).rejects.toThrow(
      '正式发布前必须由管理员确认税率 13%（来源：BusinessConfig.salesTaxRate）',
    );
    expect(prisma.uberMenuPublishVersion.create).not.toHaveBeenCalled();
  });

  it('正式发布使用 eats.store 应用 token 上传菜单，不读取商户连接 token', async () => {
    const prisma = createNestedMenuPrisma([]);
    prisma.uberStoreMapping.findFirst.mockResolvedValue({
      uberStoreId: 'uber_store_1',
      rawPayload: { timezone: 'America/Toronto' },
    });
    prisma.uberMenuPublishVersion.create.mockResolvedValue({
      id: 'version_1',
      versionStableId: 'menu_version_1',
      createdAt: new Date('2026-08-03T00:00:00.000Z'),
    });
    Object.assign(prisma.uberMenuPublishVersion, {
      update: jest.fn().mockResolvedValue(null),
    });
    Object.assign(prisma, {
      uberPublishedMenuItem: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(prisma),
      ),
    });
    const authService = createAuthService() as unknown as {
      getAccessToken: jest.Mock<Promise<string>, [string?]>;
    };
    authService.getAccessToken.mockResolvedValue('eats-store-app-token');
    const service = new UberMenuService(
      prisma as unknown as ConstructorParameters<typeof UberMenuService>[0],
      authService as unknown as ConstructorParameters<
        typeof UberMenuService
      >[0],
    );
    const merchantConnectionSpy = jest.spyOn(
      service as unknown as ConstructorParameters<typeof UberMenuService>[0],
      'resolveMerchantConnection' as unknown as ConstructorParameters<
        typeof UberMenuService
      >[0],
    );
    const uberApiSpy = jest
      .spyOn(
        service as unknown as ConstructorParameters<typeof UberMenuService>[0],
        'callUberApi' as unknown as ConstructorParameters<
          typeof UberMenuService
        >[0],
      )
      .mockResolvedValue({
        resource_id: 'uploaded_menu',
      } as unknown as ConstructorParameters<typeof UberMenuService>[0]);
    process.env.UBER_EATS_MENU_NOTIFICATIONS_ENABLED = 'true';

    await expect(
      service.publishUberMenu({
        storeId: 's1',
        dryRun: false,
        taxRateConfirmed: true,
      }),
    ).resolves.toMatchObject({ ok: true, dryRun: false });

    expect(authService.getAccessToken).toHaveBeenCalledWith('eats.store');
    expect(uberApiSpy).toHaveBeenCalledWith(
      '/v2/eats/stores/uber_store_1/menus',
      expect.objectContaining({
        accessToken: 'eats-store-app-token',
        method: 'PUT',
      }),
    );
    expect(merchantConnectionSpy).not.toHaveBeenCalled();
    delete process.env.UBER_EATS_MENU_NOTIFICATIONS_ENABLED;
  });

  it('Dry Run 不请求 Uber token，也不调用菜单上传接口', async () => {
    const prisma = createNestedMenuPrisma([]);
    const authService = createAuthService() as unknown as {
      getAccessToken: jest.Mock<Promise<string>, [string?]>;
    };
    const service = new UberMenuService(
      prisma as unknown as ConstructorParameters<typeof UberMenuService>[0],
      authService as unknown as ConstructorParameters<
        typeof UberMenuService
      >[0],
    );
    const uberApiSpy = jest.spyOn(
      service as unknown as ConstructorParameters<typeof UberMenuService>[0],
      'callUberApi' as unknown as ConstructorParameters<
        typeof UberMenuService
      >[0],
    );

    await expect(
      service.publishUberMenu({ storeId: 's1', dryRun: true }),
    ).resolves.toMatchObject({ ok: true, dryRun: true });

    expect(authService.getAccessToken).not.toHaveBeenCalled();
    expect(uberApiSpy).not.toHaveBeenCalled();
  });

  it('拒绝将百分数格式的站内税率再次转换后发布到 Uber', async () => {
    const prisma = createNestedMenuPrisma([]);
    prisma.businessConfig.findUnique.mockResolvedValueOnce({
      timezone: 'America/Toronto',
      salesTaxRate: 13,
    });
    const service = new UberMenuService(
      prisma as unknown as ConstructorParameters<typeof UberMenuService>[0],
      createAuthService(),
    );

    await expect(
      service.publishUberMenu({ storeId: 's1', dryRun: true }),
    ).rejects.toThrow(
      'salesTaxRate 必须使用 0～1 的比例格式，例如 13% 应保存为 0.13',
    );
  });

  it('拒绝将百分数格式的站内税率再次转换后发布到 Uber', async () => {
    const prisma = createNestedMenuPrisma([]);
    prisma.businessConfig.findUnique.mockResolvedValueOnce({
      timezone: 'America/Toronto',
      salesTaxRate: 13,
    });
    const service = new UberMenuService(
      prisma as unknown as ConstructorParameters<typeof UberMenuService>[0],
      createAuthService(),
    );

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
    const service = new UberMenuService(
      prisma as unknown as ConstructorParameters<typeof UberMenuService>[0],
      createAuthService(),
    );
    const uberApiSpy = jest.spyOn(
      service as unknown as ConstructorParameters<typeof UberMenuService>[0],
      'callUberApi',
    );

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
    const service = new UberMenuService(
      prisma as unknown as ConstructorParameters<typeof UberMenuService>[0],
      createAuthService(),
    );
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
    const service = new UberMenuService(
      {} as unknown as ConstructorParameters<typeof UberMenuService>[0],
      createAuthService(),
    );
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
    const service = new UberMenuService(
      {} as unknown as ConstructorParameters<typeof UberMenuService>[0],
      createAuthService(),
    );
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
    const service = new UberMenuService(
      {} as unknown as ConstructorParameters<typeof UberMenuService>[0],
      createAuthService(),
    );
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

  describe('Uber 菜单图片 URL', () => {
    it('使用网站公网域名补全数据库中的 /uploads 相对路径', () => {
      process.env.PUBLIC_BASE_URL = 'https://menu.sanq.ca/';

      expect(resolveUberImageUrl('/uploads/images/dish.jpg')).toBe(
        'https://menu.sanq.ca/uploads/images/dish.jpg',
      );
    });

    it('保留已经是绝对地址的图片 URL', () => {
      process.env.PUBLIC_BASE_URL = 'https://menu.sanq.ca';

      expect(resolveUberImageUrl('https://cdn.example.com/dish.jpg')).toBe(
        'https://cdn.example.com/dish.jpg',
      );
    });

    it('未配置公网域名时使用生产网站域名补全路径', () => {
      delete process.env.PUBLIC_BASE_URL;
      delete process.env.WEB_BASE_URL;

      expect(resolveUberImageUrl('/uploads/images/dish.jpg')).toBe(
        'https://sanq.ca/uploads/images/dish.jpg',
      );
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
              day_of_week: 'monday',
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
          price_info: { price: 100, overrides: [] },
          tax_info: { tax_rate: 13, vat_rate_percentage: null },
          modifier_group_ids: { ids: ['group'], overrides: [] },
          suspension_info: null,
        },
        {
          id: 'option',
          title: { translations: { en_us: 'Option' } },
          price_info: { price: 0, overrides: [] },
          tax_info: { tax_rate: 13, vat_rate_percentage: null },
          modifier_group_ids: { ids: null, overrides: [] },
          suspension_info: null,
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
      const service = new UberMenuService(
        {} as unknown as ConstructorParameters<typeof UberMenuService>[0],
        createAuthService(),
      );
      expect(
        service.validateUberMenuPayload(
          validPayload() as unknown as ConstructorParameters<
            typeof UberMenuService
          >[0],
        ),
      ).toEqual([]);
    });

    it('合法公网 HTTPS 图片由异步发布前检查负责，静态结构校验通过', () => {
      const payload = validPayload();
      (
        payload.items[0] as (typeof payload.items)[number] & {
          image_url?: string;
        }
      ).image_url = 'https://cdn.example.com/menu/dish.jpg';
      const service = new UberMenuService(
        {} as unknown as ConstructorParameters<typeof UberMenuService>[0],
        createAuthService(),
      );
      expect(
        service.validateUberMenuPayload(
          payload as unknown as ConstructorParameters<
            typeof UberMenuService
          >[0],
        ),
      ).toEqual([]);
    });

    it('图片预检记录重定向后的 origin、类型和大小', async () => {
      const payload = validPayload();
      (
        payload.items[0] as (typeof payload.items)[number] & {
          image_url?: string;
        }
      ).image_url = 'https://images.example.com/dish.jpg';
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://cdn.example.net/public/dish.jpg',
        headers: new Headers({
          'content-type': 'image/jpeg',
          'content-length': '2048',
        }),
      });
      const service = new UberMenuService(
        {} as unknown as ConstructorParameters<typeof UberMenuService>[0],
        createAuthService(),
      );
      const preflight = await (
        service as unknown as {
          validateUberMenuImages(input: unknown): Promise<{
            issues: unknown[];
            results: Array<Record<string, unknown>>;
          }>;
        }
      ).validateUberMenuImages(payload);

      expect(preflight.issues).toEqual([]);
      expect(preflight.results).toEqual([
        expect.objectContaining({
          finalOrigin: 'https://cdn.example.net',
          redirected: true,
          contentType: 'image/jpeg',
          sizeBytes: 2048,
          ok: true,
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
      const service = new UberMenuService(
        {} as unknown as ConstructorParameters<typeof UberMenuService>[0],
        createAuthService(),
      );

      expect(
        service.validateUberMenuPayload(
          payload as unknown as ConstructorParameters<
            typeof UberMenuService
          >[0],
        ),
      ).toContainEqual(
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
      const service = new UberMenuService(
        {} as unknown as ConstructorParameters<typeof UberMenuService>[0],
        createAuthService(),
      );

      expect(
        service.validateUberMenuPayload(
          payload as unknown as ConstructorParameters<
            typeof UberMenuService
          >[0],
        ),
      ).toContainEqual(
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
      const service = new UberMenuService(
        {} as unknown as ConstructorParameters<typeof UberMenuService>[0],
        createAuthService(),
      );
      expect(
        service.validateUberMenuPayload(
          payload as unknown as ConstructorParameters<
            typeof UberMenuService
          >[0],
        ),
      ).toContainEqual(
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
          p.items[1].modifier_group_ids.ids = ['group'];
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
      const service = new UberMenuService(
        {} as unknown as ConstructorParameters<typeof UberMenuService>[0],
        createAuthService(),
      );
      const issue = service
        .validateUberMenuPayload(
          payload as unknown as ConstructorParameters<
            typeof UberMenuService
          >[0],
        )
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

describe('UberMenuService 已发布菜单商品映射', () => {
  const resolve = async (
    externalItemId: string,
    overrides: Record<string, unknown> = {},
    stableIdHint?: string,
  ) => {
    const tx = {
      uberPublishedMenuItem: { findFirst: jest.fn().mockResolvedValue(null) },
      menuItem: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      uberItemChannelConfig: { findFirst: jest.fn().mockResolvedValue(null) },
      ...overrides,
    };
    const service = Object.create(UberMenuService.prototype) as UberMenuService;
    const value = await (
      service as unknown as {
        resolveUberProductStableId: (
          client: unknown,
          storeId: string,
          item: unknown,
        ) => Promise<string>;
      }
    ).resolveUberProductStableId(tx, 'uber-store-1', {
      externalItemId,
      stableIdHint,
      displayName: '商品',
    });
    return { value, tx };
  };

  it('无法映射的历史外部菜品保留外部 ID 以便 displayName 回退展示', async () => {
    const { value } = await resolve('legacy-external-item');
    expect(value).toBe('legacy-external-item');
  });

  it.each([
    ['当前版本', 'menu-current'],
    ['上一发布版本', 'menu-previous'],
  ])('优先使用%s的最近快照', async (_label, stableId) => {
    const findFirst = jest
      .fn()
      .mockResolvedValue({ menuItemStableId: stableId });
    const { value } = await resolve('sanq:item-id', {
      uberPublishedMenuItem: { findFirst },
    });

    expect(value).toBe(stableId);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { publishedAt: 'desc' } }),
    );
  });

  it('同一商品多版本价格不影响最近快照的稳定 ID 映射', async () => {
    const { value } = await resolve('sanq:item-id', {
      uberPublishedMenuItem: {
        findFirst: jest.fn().mockResolvedValue({ menuItemStableId: 'menu-1' }),
      },
    });
    expect(value).toBe('menu-1');
  });

  it('快照缺失时回退到确定性 hash', async () => {
    const stableId = 'menu-hash';
    const externalItemId = `sanq:${createHash('sha1')
      .update(`item:uber-store-1:${stableId}`)
      .digest('hex')
      .slice(0, 24)}`;
    const { value } = await resolve(externalItemId, {
      menuItem: {
        findMany: jest.fn().mockResolvedValue([{ stableId }]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    });
    expect(value).toBe(stableId);
  });

  it('未知 sanq ID 最后仍可使用历史渠道配置', async () => {
    const { value } = await resolve('sanq:unknown', {
      uberItemChannelConfig: {
        findFirst: jest.fn().mockResolvedValue({ menuItemStableId: 'legacy' }),
      },
    });
    expect(value).toBe('legacy');
  });
});
