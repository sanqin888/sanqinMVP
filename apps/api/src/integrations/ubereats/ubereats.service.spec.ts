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

import { createHash, createHmac } from 'crypto';
import { AppLogger } from '../../common/app-logger';
import {
  resolveUberImageUrl,
  toUberServiceAvailability,
  UberEatsService,
} from './ubereats.service';

type MenuConfirmationTestApi = {
  confirmUploadedMenu: (
    versionId: string,
    uberStoreId: string,
    requested: {
      menus: unknown[];
      categories: unknown[];
      modifier_groups: unknown[];
      items: Array<{ id: string }>;
    },
  ) => Promise<'SUBMITTED' | 'SUCCEEDED' | 'FAILED'>;
  pollUploadedMenuUntilTerminal: (
    versionId: string,
    storeId: string,
    uberStoreId: string,
    requested: {
      menus: unknown[];
      categories: unknown[];
      modifier_groups: unknown[];
      items: unknown[];
    },
  ) => Promise<void>;
};

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

describe('UberEatsService 门店状态同步', () => {
  const auth = () =>
    ({ getAccessToken: jest.fn().mockResolvedValue('status-token') }) as never;
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
    const service = new UberEatsService(db as never, auth());

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
    const service = new UberEatsService(db as never, auth());

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
    const service = new UberEatsService(db as never, auth());

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

describe('UberEatsService', () => {
  const clientSecret = 'test-ubereats-secret';
  const createInboxMock = () => ({
    create: jest.fn().mockResolvedValue({ id: 'inbox_1' }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    upsert: jest.fn().mockResolvedValue({ id: 'inbox_1' }),
  });
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
    }) as never;

  beforeEach(() => {
    process.env.UBER_EATS_CLIENT_SECRET = clientSecret;
    process.env.UBER_EATS_WEBHOOK_SIGNING_KEY = clientSecret;
    process.env.UBER_EATS_OAUTH_STATE_SECRET =
      'high-entropy-test-secret-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.UBER_EATS_CLIENT_SECRET;
    delete process.env.UBER_EATS_WEBHOOK_SIGNING_KEY;
    delete process.env.UBER_EATS_API_BASE_URL;
    delete process.env.UBER_EATS_OAUTH_STATE_SECRET;
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.WEB_BASE_URL;
    jest.restoreAllMocks();
  });

  const createSignatureOnlyPrisma = () => ({
    uberWebhookInbox: {
      create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    opsEvent: {
      create: jest.fn().mockResolvedValue(null),
    },
  });

  const verifySignature = (
    service: UberEatsService,
    rawBody: string,
    headers: Record<string, unknown>,
  ) =>
    service.handleWebhook({
      headers,
      rawBody,
      body: { event_type: 'orders.notification', event_id: 'fixed-event' },
    });

  it('初始化时缺少 webhook signing key 会立即失败', () => {
    delete process.env.UBER_EATS_WEBHOOK_SIGNING_KEY;

    expect(() => new UberEatsService({} as never, createAuthService())).toThrow(
      'UBER_EATS_WEBHOOK_SIGNING_KEY 未配置',
    );
  });

  it('使用 Uber webhook signing key 验签', async () => {
    const rawBody =
      '{"event_type":"orders.notification","event_id":"signing-key-event"}';
    process.env.UBER_EATS_WEBHOOK_SIGNING_KEY = 'uber-webhook-signing-key';
    const signature = createHmac(
      'sha256',
      process.env.UBER_EATS_WEBHOOK_SIGNING_KEY,
    )
      .update(rawBody)
      .digest('hex');
    const service = new UberEatsService(
      createSignatureOnlyPrisma() as never,
      createAuthService(),
    );

    await expect(
      verifySignature(service, rawBody, {
        'x-uber-signature': signature,
      }),
    ).resolves.toBeUndefined();
  });

  it('接受 Uber 文档算法的固定 UTF-8/HMAC-SHA256 十六进制签名向量', async () => {
    const rawBody =
      '{"event_type":"orders.notification","event_id":"d4e4a8b1-3b7d-4f61-9e4b-123456789abc"}';
    process.env.UBER_EATS_WEBHOOK_SIGNING_KEY = 'uber-client-secret';
    const documentedVector =
      '552930492844589395696d9784bab01a2205c2d9ff3aeffc9a1bcb154217d3e1';
    const service = new UberEatsService(
      createSignatureOnlyPrisma() as never,
      createAuthService(),
    );
    const warnSpy = jest
      .spyOn(AppLogger.prototype, 'warn')
      .mockImplementation();
    await expect(
      verifySignature(service, rawBody, {
        'x-uber-signature': documentedVector,
      }),
    ).resolves.toBeUndefined();
    expect(warnSpy.mock.calls.flat().join(' ')).not.toContain(
      'signature verification',
    );
  });

  it.each([
    [
      'body 被修改',
      '{"event_type":"orders.notification","changed":true}',
      clientSecret,
    ],
    ['secret 错误', '{"event_type":"orders.notification"}', 'wrong-secret'],
  ])('拒绝%s时的签名', async (caseName, rawBody, signingSecret) => {
    const signature = createHmac('sha256', signingSecret)
      .update(rawBody, 'utf8')
      .digest('hex');
    const receivedBody = caseName === 'body 被修改' ? `${rawBody} ` : rawBody;
    const service = new UberEatsService(
      createSignatureOnlyPrisma() as never,
      createAuthService(),
    );
    await expect(
      verifySignature(service, receivedBody, {
        'x-uber-signature': signature,
      }),
    ).rejects.toThrow('Invalid Uber signature');
  });

  it('拒绝缺少唯一 X-Uber-Signature header 的请求', async () => {
    const warnSpy = jest
      .spyOn(AppLogger.prototype, 'warn')
      .mockImplementation();
    const service = new UberEatsService(
      createSignatureOnlyPrisma() as never,
      createAuthService(),
    );
    await expect(verifySignature(service, '{}', {})).rejects.toThrow(
      'Missing Uber signature header',
    );
    await expect(
      verifySignature(service, '{}', {
        'x-uber-eats-signature': createHmac('sha256', clientSecret)
          .update('{}', 'utf8')
          .digest('hex'),
      }),
    ).rejects.toThrow('Missing Uber signature header');

    const logs = warnSpy.mock.calls.flat().join(' ');
    expect(logs).toContain('signaturePresent=false');
    expect(logs).not.toContain(clientSecret);
    expect(logs).not.toContain('{}');
  });

  it('拒绝非 64 位 hex 签名并仅记录安全的格式诊断', async () => {
    const rawBody = '{"private":"order-payload-must-not-be-logged"}';
    const invalidSignature = 'not-a-valid-signature';
    const warnSpy = jest
      .spyOn(AppLogger.prototype, 'warn')
      .mockImplementation();
    const service = new UberEatsService(
      createSignatureOnlyPrisma() as never,
      createAuthService(),
    );

    await expect(
      verifySignature(service, rawBody, {
        'x-uber-signature': `  ${invalidSignature}  `,
      }),
    ).rejects.toThrow('Invalid Uber signature');

    const logs = warnSpy.mock.calls.flat().join(' ');
    expect(logs).toContain('signaturePresent=true');
    expect(logs).toContain(`signatureLength=${invalidSignature.length}`);
    expect(logs).toContain('signatureEncoding=invalid');
    expect(logs).toContain(
      `rawBodyBytes=${Buffer.byteLength(rawBody, 'utf8')}`,
    );
    expect(logs).not.toContain(invalidSignature);
    expect(logs).not.toContain(clientSecret);
    expect(logs).not.toContain(rawBody);
  });

  it('HMAC 不匹配时记录 current 状态但不泄露敏感数据', async () => {
    const rawBody = '{"private":"order-payload-must-not-be-logged"}';
    const signature = createHmac('sha256', 'unrelated-secret')
      .update(rawBody)
      .digest('hex');
    const warnSpy = jest
      .spyOn(AppLogger.prototype, 'warn')
      .mockImplementation();
    const service = new UberEatsService(
      createSignatureOnlyPrisma() as never,
      createAuthService(),
    );

    await expect(
      verifySignature(service, rawBody, { 'x-uber-signature': signature }),
    ).rejects.toThrow('Invalid Uber signature');

    const logs = warnSpy.mock.calls.flat().join(' ');
    expect(logs).toContain('signatureEncoding=hex');
    expect(logs).toContain('currentSecretMatched=false');
    for (const sensitive of [signature, clientSecret, rawBody]) {
      expect(logs).not.toContain(sensitive);
    }
  });

  it('按 HTTP 规则不区分签名 header 名称大小写', async () => {
    const rawBody = '{"event_type":"orders.notification"}';
    const signature = createHmac('sha256', clientSecret)
      .update(rawBody, 'utf8')
      .digest('hex');
    const service = new UberEatsService(
      createSignatureOnlyPrisma() as never,
      createAuthService(),
    );
    jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
    await expect(
      verifySignature(service, rawBody, {
        'X-UbEr-SiGnAtUrE': signature,
      }),
    ).resolves.toBeUndefined();
  });

  it('标准资源引用通知会下载完整订单后写入 ubereats 订单', async () => {
    const body = {
      event_type: 'orders.notification',
      resource_href: 'https://api.uber.com/v2/eats/order/ue_123',
      meta: { resource_id: 'ue_123', user_id: 'user_1' },
      event_id: 'evt_123',
    };
    const rawBody = JSON.stringify(body);
    const signature = createHmac('sha256', clientSecret)
      .update(rawBody, 'utf8')
      .digest('hex');

    const prisma = {
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValue({ id: 'order-db-id' }),
        create: jest.fn().mockResolvedValue({
          id: 'order-db-id',
          orderStableId: 'ord_uber_1',
          status: 'paid',
        }),
      },
      orderItem: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn(),
      },
      menuItem: { findFirst: jest.fn() },
      uberItemChannelConfig: { findFirst: jest.fn() },
      uberOrderItemModifier: { createMany: jest.fn() },
      uberWebhookInbox: createInboxMock(),
      businessConfig: {
        findUnique: jest.fn().mockResolvedValue({ isTemporarilyClosed: false }),
      },
      uberOrderAction: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'action_1',
          status: 'PENDING',
          retryable: false,
          uberHttpStatus: null,
        }),
        update: jest.fn(),
      },
      opsEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(null),
      },
    };
    Object.assign(prisma, {
      $transaction: jest.fn(
        (callback: (transaction: typeof prisma) => unknown) => callback(prisma),
      ),
    });

    const auth = createAuthService() as unknown as {
      getAccessToken: jest.Mock;
    };
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            order_id: 'ue_123',
            subtotal_cents: 1000,
            tax_cents: 130,
            total_cents: 1130,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const service = new UberEatsService(prisma as never, auth as never);
    await service.handleWebhook({
      headers: {
        'x-uber-signature': signature,
        'x-event-id': 'evt_123',
      },
      rawBody,
      body,
    });

    expect(auth.getAccessToken).toHaveBeenCalledWith('eats.store.orders.read');
    expect(fetchSpy).toHaveBeenCalledWith(
      body.resource_href,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(prisma.order.findUnique).toHaveBeenCalled();
    expect(prisma.order.create).toHaveBeenCalled();
    expect(prisma.uberWebhookInbox.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: 'evt_123' } }),
    );
    fetchSpy.mockRestore();
  });

  it('解析多数量、嵌套 modifier、特殊说明、折扣、税费和未知商品快照', () => {
    const service = new UberEatsService(
      createSignatureOnlyPrisma() as never,
      createAuthService(),
    );
    const parsed = (
      service as unknown as {
        parseOrderPayload(payload: unknown): {
          displayId: string;
          discountCents: number;
          taxCents: number;
          items: Array<{
            quantity: number;
            displayName: string;
            specialInstructions: string | null;
            optionsUnitPriceCents: number;
            modifiers: Array<{ children: unknown[] }>;
          }>;
        };
      }
    ).parseOrderPayload({
      order_id: 'ue_complex',
      display_id: 'A-2048',
      subtotal_cents: 2700,
      discount_cents: 300,
      tax_cents: 312,
      total_cents: 2712,
      items: [
        {
          line_item_id: 'line_unknown',
          item_id: 'not-in-local-menu',
          title: 'External noodle snapshot',
          quantity: 2,
          unit_price: 1350,
          total_price: 2700,
          special_instructions: '不要香菜',
          modifiers: [
            {
              id: 'size-large',
              title: 'Large',
              quantity: 1,
              price_delta: 200,
              modifiers: [
                {
                  id: 'extra-meat',
                  title: 'Extra meat',
                  quantity: 2,
                  price_delta: 75,
                },
              ],
            },
          ],
        },
      ],
    });

    expect(parsed).toMatchObject({
      displayId: 'A-2048',
      discountCents: 300,
      taxCents: 312,
    });
    expect(parsed.items[0]).toMatchObject({
      quantity: 2,
      displayName: 'External noodle snapshot',
      specialInstructions: '不要香菜',
      optionsUnitPriceCents: 350,
    });
    expect(parsed.items[0].modifiers[0].children).toHaveLength(1);
  });

  it('origin 不匹配时拒绝 resource_href，并只记录 origin/path 非敏感信息', async () => {
    process.env.UBER_EATS_API_BASE_URL = 'https://api.uber.com/v2';
    const warnSpy = jest
      .spyOn(AppLogger.prototype, 'warn')
      .mockImplementation();
    const body = {
      event_type: 'orders.notification',
      resource_href:
        'https://evil.example/v2/eats/order/ue_123?customer_name=Alice&phone=4165551234&address=1%20Main%20St&Authorization=Bearer%20secret-token',
      meta: { resource_id: 'ue_123', user_id: 'user_1' },
      event_id: 'evt_bad_href',
    };
    const rawBody = JSON.stringify(body);
    const signature = createHmac('sha256', clientSecret)
      .update(rawBody, 'utf8')
      .digest('hex');
    const prisma = {
      uberWebhookInbox: createInboxMock(),
      opsEvent: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new UberEatsService(prisma as never, createAuthService());

    await expect(
      service.handleWebhook({
        headers: { 'x-uber-signature': signature },
        rawBody,
        body,
      }),
    ).rejects.toThrow('Uber resource_href 不属于配置的 API base');

    const logs = warnSpy.mock.calls.flat().join(' ');
    expect(logs).toContain('ubereats webhook resource_href rejected');
    expect(logs).toContain('resourceOrigin=https://evil.example');
    expect(logs).toContain('resourcePathname=/v2/eats/order/ue_123');
    expect(logs).toContain('baseOrigin=https://api.uber.com');
    expect(logs).toContain('basePathname=/v2');
    for (const sensitive of [
      'customer_name',
      'Alice',
      'phone',
      '4165551234',
      'address',
      '1%20Main%20St',
      'Authorization',
      'secret-token',
    ]) {
      expect(logs).not.toContain(sensitive);
    }
    delete process.env.UBER_EATS_API_BASE_URL;
  });

  it.each([401, 403])(
    '订单详情 GET 返回 %i 时刷新后消费不可恢复失败并脱敏日志',
    async (status) => {
      const body = {
        event_type: 'orders.notification',
        resource_href:
          'https://api.uber.com/v2/eats/order/ue_auth?customer_name=Alice&phone=4165551234&access_token=query-secret',
        meta: { resource_id: 'ue_auth', user_id: 'user_1' },
        event_id: `evt_auth_${status}`,
      };
      const rawBody = JSON.stringify(body);
      const signature = createHmac('sha256', clientSecret)
        .update(rawBody, 'utf8')
        .digest('hex');
      const prisma = {
        uberWebhookInbox: createInboxMock(),
        opsEvent: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
        },
      };
      const errorSpy = jest
        .spyOn(AppLogger.prototype, 'error')
        .mockImplementation();
      const authErrorResponse = new Response(
        JSON.stringify({
          code: 'insufficient_scope',
          message:
            'Bearer upstream-secret access_token=body-secret client_secret=client-secret missing store authorization',
          customer: {
            name: 'Alice',
            phone: '4165551234',
            address: '1 Main St',
          },
        }),
        {
          status,
          headers: { 'x-uber-request-id': 'uber_req_auth' },
        },
      );
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(authErrorResponse)
        .mockResolvedValueOnce(authErrorResponse.clone());
      const service = new UberEatsService(prisma as never, createAuthService());

      await expect(
        service.handleWebhook({
          headers: { 'x-uber-signature': signature },
          rawBody,
          body,
        }),
      ).resolves.toBeUndefined();

      expect(prisma.uberWebhookInbox.updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FAILED',
            errorSummary: expect.stringContaining(
              'missing store authorization',
            ) as unknown,
            nextRetryAt: null,
          }) as unknown,
        }),
      );

      const logs = errorSpy.mock.calls.flat().join(' ');
      expect(logs).toContain(`status=${status}`);
      expect(logs).toContain('eventId=evt_auth_');
      expect(logs).toContain('resourceId=ue_auth');
      expect(logs).toContain(
        'resourceUrl=https://api.uber.com/v2/eats/order/ue_auth',
      );
      expect(logs).toContain('uberRequestId=uber_req_auth');
      expect(logs).toContain('insufficient_scope');
      for (const sensitive of [
        'upstream-secret',
        'body-secret',
        'client-secret',
        'customer_name',
        'Alice',
        '4165551234',
        '1 Main St',
        'query-secret',
      ]) {
        expect(logs).not.toContain(sensitive);
      }
    },
  );

  it.each([429, 503])('Uber %i 时保留通知为可重试失败', async (status) => {
    const body = {
      event_type: 'orders.notification',
      resource_href: 'https://api.uber.com/v2/eats/order/ue_retry',
      meta: { resource_id: 'ue_retry', user_id: 'user_1' },
      event_id: `evt_${status}`,
    };
    const rawBody = JSON.stringify(body);
    const signature = createHmac('sha256', clientSecret)
      .update(rawBody, 'utf8')
      .digest('hex');
    const prisma = {
      uberWebhookInbox: createInboxMock(),
      opsEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    };
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('upstream unavailable', { status }));
    const service = new UberEatsService(prisma as never, createAuthService());

    await expect(
      service.handleWebhook({
        headers: { 'x-uber-signature': signature },
        rawBody,
        body,
      }),
    ).rejects.toMatchObject({ status: 502 });
    expect(prisma.opsEvent.create).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('重复通知不会再次下载订单', async () => {
    const body = {
      event_type: 'orders.notification',
      resource_href: 'https://api.uber.com/v2/eats/order/ue_seen',
      meta: { resource_id: 'ue_seen', user_id: 'user_1' },
      event_id: 'evt_seen',
    };
    const rawBody = JSON.stringify(body);
    const signature = createHmac('sha256', clientSecret)
      .update(rawBody, 'utf8')
      .digest('hex');
    const fetchSpy = jest.spyOn(global, 'fetch');
    const duplicateInbox = createInboxMock();
    duplicateInbox.create.mockRejectedValue({ code: 'P2002' });
    duplicateInbox.updateMany.mockResolvedValue({ count: 0 });
    const service = new UberEatsService(
      {
        uberWebhookInbox: duplicateInbox,
        opsEvent: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
      } as never,
      createAuthService(),
    );
    await service.handleWebhook({
      headers: { 'x-uber-signature': signature },
      rawBody,
      body,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('并发重复投递只有一个请求取得 PROCESSING 所有权', async () => {
    const inbox = createInboxMock();
    inbox.create
      .mockResolvedValueOnce({ id: 'owner' })
      .mockRejectedValueOnce({ code: 'P2002' });
    inbox.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const service = new UberEatsService(
      { uberWebhookInbox: inbox } as never,
      createAuthService(),
    ) as unknown as {
      claimWebhookEvent: (
        id: string,
        type: string,
        orderId: string | null,
        payload: unknown,
      ) => Promise<boolean>;
    };

    await expect(
      Promise.all([
        service.claimWebhookEvent('evt_concurrent', 'store.provisioned', null, {
          value: 1,
        }),
        service.claimWebhookEvent('evt_concurrent', 'store.provisioned', null, {
          value: 1,
        }),
      ]),
    ).resolves.toEqual([true, false]);
  });

  it('首次失败后可由后续投递重新取得处理权', async () => {
    const inbox = createInboxMock();
    inbox.create.mockRejectedValue({ code: 'P2002' });
    inbox.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const service = new UberEatsService(
      { uberWebhookInbox: inbox } as never,
      createAuthService(),
    ) as unknown as {
      claimWebhookEvent: (
        id: string,
        type: string,
        orderId: string | null,
        payload: unknown,
      ) => Promise<boolean>;
    };

    await expect(
      service.claimWebhookEvent('evt_retry', 'store.provisioned', null, {}),
    ).resolves.toBe(true);
    expect(inbox.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ status: 'FAILED' }) as unknown,
      }),
    );
  });

  it('inbox 数据库中断时不确认 webhook', async () => {
    const inbox = createInboxMock();
    inbox.create.mockRejectedValue(new Error('database unavailable'));
    const service = new UberEatsService(
      { uberWebhookInbox: inbox } as never,
      createAuthService(),
    ) as unknown as {
      claimWebhookEvent: (
        id: string,
        type: string,
        orderId: string | null,
        payload: unknown,
      ) => Promise<boolean>;
    };
    await expect(
      service.claimWebhookEvent('evt_db_down', 'store.provisioned', null, {}),
    ).rejects.toThrow('database unavailable');
  });

  it('进程重启后由数据库唯一键继续阻止已持久化事件重复处理', async () => {
    const inbox = createInboxMock();
    inbox.create.mockRejectedValue({ code: 'P2002' });
    inbox.updateMany.mockResolvedValue({ count: 0 });
    const restartedService = new UberEatsService(
      { uberWebhookInbox: inbox } as never,
      createAuthService(),
    ) as unknown as {
      claimWebhookEvent: (
        id: string,
        type: string,
        orderId: string | null,
        payload: unknown,
      ) => Promise<boolean>;
    };
    await expect(
      restartedService.claimWebhookEvent(
        'evt_before_restart',
        'store.provisioned',
        null,
        {},
      ),
    ).resolves.toBe(false);
  });

  it('未知订单 schema 会告警、保留 payload 并返回非 2xx 语义错误', async () => {
    const body = { event_type: 'orders.future_schema', opaque: { keep: true } };
    const rawBody = JSON.stringify(body);
    const inbox = createInboxMock();
    const opsEvent = { create: jest.fn().mockResolvedValue(null) };
    const service = new UberEatsService(
      { uberWebhookInbox: inbox, opsEvent } as never,
      createAuthService(),
    );

    await expect(
      service.handleWebhook({
        headers: {
          'x-uber-signature': createHmac('sha256', clientSecret)
            .update(rawBody)
            .digest('hex'),
        },
        rawBody,
        body,
      }),
    ).rejects.toThrow('未识别的 Uber 订单事件类型');
    expect(inbox.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) as unknown,
        payload: body,
        status: 'RECEIVED',
      }) as unknown,
    });
    expect(opsEvent.create).toHaveBeenCalled();
    expect(inbox.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }) as unknown,
      }),
    );
  });

  it.each([
    [429, 'retry'],
    [500, 'retry'],
    [502, 'retry'],
    [503, 'retry'],
    [504, 'retry'],
    [400, 'consume'],
    [401, 'consume'],
    [403, 'consume'],
    [404, 'consume'],
  ] as const)(
    '订单详情接口返回 %i 时 webhook 应 %s',
    async (status, behavior) => {
      const body = {
        event_type: 'orders.notification',
        resource_href: 'https://api.uber.com/v2/eats/order/ue_status_matrix',
        meta: { resource_id: 'ue_status_matrix', user_id: 'user_1' },
        event_id: `evt_status_${status}`,
      };
      const rawBody = JSON.stringify(body);
      const signature = createHmac('sha256', clientSecret)
        .update(rawBody, 'utf8')
        .digest('hex');
      const inbox = createInboxMock();
      const opsEvent = {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(null),
      };
      const prisma = { uberWebhookInbox: inbox, opsEvent };
      const auth = createAuthService();
      const fetchSpy = jest.spyOn(global, 'fetch');
      const responseBody = JSON.stringify({ message: `status ${status}` });
      if (status === 401 || status === 403) {
        fetchSpy
          .mockResolvedValueOnce(new Response(responseBody, { status }))
          .mockResolvedValueOnce(new Response(responseBody, { status }));
      } else {
        fetchSpy.mockResolvedValueOnce(new Response(responseBody, { status }));
      }

      const service = new UberEatsService(prisma as never, auth);
      const result = service.handleWebhook({
        headers: { 'x-uber-signature': signature },
        rawBody,
        body,
      });

      if (behavior === 'retry') {
        await expect(result).rejects.toThrow('Uber 订单详情接口返回错误');
        expect(inbox.updateMany).toHaveBeenLastCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: 'FAILED',
              errorSummary: expect.stringContaining(String(status)) as unknown,
              nextRetryAt: expect.any(Date) as unknown,
            }) as unknown,
          }),
        );
        expect(opsEvent.create).not.toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              eventName: 'ubereats_webhook_non_retryable_failed',
            }) as unknown,
          }),
        );
      } else {
        await expect(result).resolves.toBeUndefined();
        expect(inbox.updateMany).toHaveBeenLastCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: 'FAILED',
              errorSummary: expect.stringContaining(String(status)) as unknown,
              nextRetryAt: null,
            }) as unknown,
          }),
        );
        expect(opsEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              eventName: 'ubereats_webhook_non_retryable_failed',
            }) as unknown,
          }),
        );
      }
    },
  );

  it('订单详情 401 先刷新 token 并重试一次后再判定状态', async () => {
    const body = {
      event_type: 'orders.notification',
      resource_href: 'https://api.uber.com/v2/eats/order/ue_token_retry',
      meta: { resource_id: 'ue_token_retry', user_id: 'user_1' },
      event_id: 'evt_token_retry',
    };
    const rawBody = JSON.stringify(body);
    const signature = createHmac('sha256', clientSecret)
      .update(rawBody, 'utf8')
      .digest('hex');
    const inbox = createInboxMock();
    const opsEvent = {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(null),
    };
    const auth = createAuthService();
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response('{"message":"expired"}', { status: 401 }),
      )
      .mockResolvedValueOnce(
        new Response('{"message":"still forbidden"}', { status: 403 }),
      );

    const service = new UberEatsService(
      { uberWebhookInbox: inbox, opsEvent } as never,
      auth,
    );

    await expect(
      service.handleWebhook({
        headers: { 'x-uber-signature': signature },
        rawBody,
        body,
      }),
    ).resolves.toBeUndefined();
    expect(auth.forceRefreshAccessToken).toHaveBeenCalledWith(
      'eats.store.orders.read',
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('下载成功但订单解析失败时按原因拒单且不记录为已处理', async () => {
    const body = {
      event_type: 'orders.notification',
      resource_href: 'https://api.uber.com/v2/eats/order/ue_invalid',
      meta: { resource_id: 'ue_invalid', user_id: 'user_1' },
      event_id: 'evt_invalid_order',
    };
    const rawBody = JSON.stringify(body);
    const signature = createHmac('sha256', clientSecret)
      .update(rawBody, 'utf8')
      .digest('hex');
    const prisma = {
      uberOrderAction: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'deny_1',
          status: 'PENDING',
          retryable: false,
          uberHttpStatus: null,
        }),
        update: jest.fn(),
      },
      uberWebhookInbox: createInboxMock(),
      opsEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    };
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'ue_invalid' })))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const service = new UberEatsService(prisma as never, createAuthService());
    await expect(
      service.handleWebhook({
        headers: { 'x-uber-signature': signature },
        rawBody,
        body,
      }),
    ).resolves.toBeUndefined();
    expect(prisma.uberOrderAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reasonCode: 'INVALID_ORDER',
        }) as unknown,
      }),
    );
    expect(prisma.opsEvent.create).not.toHaveBeenCalled();
    jest.restoreAllMocks();
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
      uberWebhookInbox: createInboxMock(),
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
    const rawBody = `{
  "data": { "status": "SUCCEEDED", "resource_id": "menu_resource_1", "store_id": "uber_store_1" },
  "event_type": "menus.notification"
}`;
    const signature = createHmac('sha256', clientSecret)
      .update(rawBody, 'utf8')
      .digest('hex');
    const prisma = {
      uberMenuPublishVersion: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'version_1',
            versionStableId: 'menu_resource_1',
            status: 'SUBMITTED',
          },
        ]),
        update: jest.fn().mockResolvedValue(null),
      },
      uberWebhookInbox: createInboxMock(),
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
        meta: { resource_id: 'menu_resource_1' },
        data: {
          store_id: 'uber_store_1',
          resource_id: 'menu_resource_1',
          status: 'SUCCEEDED',
        },
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
    const rawBody = `{
  "event_type": "menus.notification",
  "data": {
    "store_id": "uber_store_1",
    "resource_id": "menu_resource_2",
    "status": "FAILED",
    "errors": [{ "code": "INVALID_PRICE", "field_path": "items[0].price_info.price", "description": "price is invalid" }]
  }
}`;
    const signature = createHmac('sha256', clientSecret)
      .update(rawBody, 'utf8')
      .digest('hex');
    const prisma = {
      uberMenuPublishVersion: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'version_2',
            versionStableId: 'menu_resource_2',
            status: 'SUBMITTED',
            requestPayload: { items: [{ id: 'local_item_1' }] },
          },
        ]),
        update: jest.fn().mockResolvedValue(null),
      },
      uberWebhookInbox: createInboxMock(),
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
          resource_id: 'menu_resource_2',
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
              entityType: 'item',
              localId: 'local_item_1',
            },
          ],
        }) as unknown,
      }),
    );
  });

  it('菜单通知先于 PUT response 回写时仍按 request 中的 resource ID 命中版本', async () => {
    const rawBody = `{
  "event_type": "menus.notification",
  "data": { "store_id": "uber_store_1", "resource_id": "uber_menu_resource", "status": "SUCCEEDED" }
}`;
    const signature = createHmac('sha256', clientSecret)
      .update(rawBody, 'utf8')
      .digest('hex');
    const update = jest.fn().mockResolvedValue(null);
    const prisma = {
      uberMenuPublishVersion: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'version_race',
            versionStableId: 'version_race',
            status: 'SUBMITTED',
            requestPayload: { menus: [{ id: 'uber_menu_resource' }] },
            responsePayload: null,
          },
        ]),
        update,
      },
      uberWebhookInbox: createInboxMock(),
      opsEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(null),
      },
    };
    await new UberEatsService(
      prisma as never,
      createAuthService(),
    ).handleWebhook({
      headers: { 'x-uber-signature': signature, 'x-event-id': 'menu_race' },
      rawBody,
      body: {
        event_type: 'menus.notification',
        data: {
          store_id: 'uber_store_1',
          resource_id: 'uber_menu_resource',
          status: 'SUCCEEDED',
        },
      },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'version_race' } }),
    );
  });

  it('重复成功菜单通知不会再次更新已成功版本', async () => {
    const rawBody = '{"event_type":"menus.notification"}';
    const signature = createHmac('sha256', clientSecret)
      .update(rawBody, 'utf8')
      .digest('hex');
    const update = jest.fn();
    const prisma = {
      uberMenuPublishVersion: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'done',
            versionStableId: 'resource_done',
            status: 'SUCCEEDED',
          },
        ]),
        update,
      },
      uberWebhookInbox: createInboxMock(),
      opsEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(null),
      },
    };
    await new UberEatsService(
      prisma as never,
      createAuthService(),
    ).handleWebhook({
      headers: {
        'x-uber-signature': signature,
        'x-event-id': 'menu_done_again',
      },
      rawBody,
      body: {
        event_type: 'menus.notification',
        data: {
          store_id: 'uber_store_1',
          resource_id: 'resource_done',
          status: 'SUCCEEDED',
        },
      },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('确认回读仍是旧菜单时保持 SUBMITTED，不误判为成功', async () => {
    const update = jest.fn();
    const authService = createAuthService() as unknown as {
      getAccessToken: jest.Mock<Promise<string>, [string?]>;
    };
    authService.getAccessToken.mockResolvedValue('eats-store-read-token');
    const service = new UberEatsService(
      { uberMenuPublishVersion: { update } } as never,
      authService,
    );
    const merchantConnectionSpy = jest.spyOn(
      service as never,
      'resolveMerchantConnection' as never,
    );
    const uberApiSpy = jest
      .spyOn(service as never, 'callUberApi' as never)
      .mockResolvedValue({ items: [{ id: 'old_item' }] } as never);
    const confirmationApi = service as unknown as MenuConfirmationTestApi;
    await expect(
      confirmationApi.confirmUploadedMenu('version_old', 'store_1', {
        menus: [],
        categories: [],
        modifier_groups: [],
        items: [{ id: 'new_item' }],
      }),
    ).resolves.toBe('SUBMITTED');
    expect(authService.getAccessToken).toHaveBeenCalledWith('eats.store');
    expect(uberApiSpy).toHaveBeenCalledWith('/v2/eats/stores/store_1/menus', {
      accessToken: 'eats-store-read-token',
      method: 'GET',
    });
    expect(merchantConnectionSpy).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it.each([401, 403])(
    '菜单 API 的 %s 鉴权失败保留结构化且脱敏的上游错误',
    async (status) => {
      jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'invalid_scope',
            message: 'missing eats.store; access_token=secret-token',
          }),
          { status },
        ),
      );
      const service = new UberEatsService({} as never, createAuthService());

      await expect(
        (
          service as never as {
            callUberApi: (
              path: string,
              options: { accessToken: string; method: 'GET' },
            ) => Promise<unknown>;
          }
        ).callUberApi('/v2/eats/stores/store_1/menus', {
          accessToken: 'request-token',
          method: 'GET',
        }),
      ).rejects.toMatchObject({
        response: {
          status,
          error: {
            upstreamStatus: status,
            code: 'invalid_scope',
            message: 'missing eats.store; access_token=[REDACTED]',
          },
        },
      });
      jest.restoreAllMocks();
    },
  );

  it('发布确认超时保持 SUBMITTED 并创建 TIMED_OUT 运营工单', async () => {
    jest.useFakeTimers();
    process.env.UBER_EATS_MENU_CONFIRM_TIMEOUT_MS = '1';
    process.env.UBER_EATS_MENU_CONFIRM_INITIAL_DELAY_MS = '1';
    const create = jest.fn().mockResolvedValue(null);
    const service = new UberEatsService(
      {
        uberMenuPublishVersion: {
          findUnique: jest.fn().mockResolvedValue({ status: 'SUBMITTED' }),
        },
        uberOpsTicket: { create },
        opsEvent: { create: jest.fn().mockResolvedValue(null) },
      } as never,
      createAuthService(),
    );
    jest
      .spyOn(service as never, 'confirmUploadedMenu' as never)
      .mockResolvedValue('SUBMITTED' as never);
    const confirmationApi = service as unknown as MenuConfirmationTestApi;
    const polling = confirmationApi.pollUploadedMenuUntilTerminal(
      'version_timeout',
      'local_store',
      'uber_store',
      { menus: [], categories: [], items: [], modifier_groups: [] },
    );
    await jest.advanceTimersByTimeAsync(2);
    await polling;
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storeId: 'local_store',
          context: expect.objectContaining({ state: 'TIMED_OUT' }) as unknown,
        }) as unknown,
      }),
    );
    delete process.env.UBER_EATS_MENU_CONFIRM_TIMEOUT_MS;
    delete process.env.UBER_EATS_MENU_CONFIRM_INITIAL_DELAY_MS;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const createActionPrisma = (
    localOrder: object | null = { id: 'local_1' },
  ) => {
    let action: Record<string, unknown> | null = null;
    return {
      order: { findUnique: jest.fn().mockResolvedValue(localOrder) },
      uberOrderAction: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(action)),
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            action = {
              id: 'action_1',
              retryable: false,
              uberHttpStatus: null,
              ...data,
            };
            return Promise.resolve(action);
          }),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            action = { ...action, ...data };
            return Promise.resolve(action);
          }),
      },
    };
  };

  it('只有本地订单完整落库后才调用 Uber 接单 endpoint', async () => {
    const missing = createActionPrisma(null);
    const service = new UberEatsService(missing as never, createAuthService());
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(service.acceptUberOrder('ue_missing')).rejects.toThrow(
      '订单尚未完整落库',
    );
    expect(fetchSpy).not.toHaveBeenCalled();

    const prisma = createActionPrisma();
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const persisted = new UberEatsService(prisma as never, createAuthService());
    await expect(persisted.acceptUberOrder('ue_saved')).resolves.toMatchObject({
      ok: true,
      duplicate: false,
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.uber.com/v1/eats/orders/ue_saved/accept_pos_order',
      expect.objectContaining({
        method: 'POST',
        body: '{"reason":"accepted"}',
      }),
    );
  });

  it('重复接单复用唯一动作记录且不重复请求 Uber', async () => {
    const prisma = createActionPrisma();
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const service = new UberEatsService(prisma as never, createAuthService());
    await service.acceptUberOrder('ue_duplicate');
    await expect(
      service.acceptUberOrder('ue_duplicate'),
    ).resolves.toMatchObject({
      duplicate: true,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('拒单 endpoint 保存业务原因 payload', async () => {
    const prisma = createActionPrisma();
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const service = new UberEatsService(prisma as never, createAuthService());
    await service.denyUberOrder('ue_deny', 'STORE_CLOSED', '门店暂停');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.uber.com/v1/eats/orders/ue_deny/deny_pos_order',
      expect.objectContaining({
        body: '{"reason":"STORE_CLOSED","details":"门店暂停"}',
      }),
    );
  });

  it('Uber 超时/网络错误标记为可重试并保存脱敏错误', async () => {
    const prisma = createActionPrisma();
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('timeout token=secret'));
    const service = new UberEatsService(prisma as never, createAuthService());
    await expect(
      service.denyUberOrder('ue_timeout', 'INVALID_ORDER'),
    ).rejects.toMatchObject({ status: 502 });
    expect(prisma.uberOrderAction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ retryable: true }) as unknown,
      }),
    );
  });

  const createReadyPrisma = (initialStatus = 'making') => {
    let localStatus = initialStatus;
    let action: Record<string, unknown> | null = null;
    const uberOrderAction = {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(action)),
      upsert: jest
        .fn()
        .mockImplementation(
          ({ create }: { create: Record<string, unknown> }) => {
            action ??= {
              id: 'ready_action',
              retryable: false,
              uberHttpStatus: null,
              attemptCount: 0,
              ...create,
            };
            return Promise.resolve(action);
          },
        ),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          const attempt = data.attemptCount as
            | { increment?: number }
            | undefined;
          action = {
            ...action,
            ...data,
            attemptCount:
              Number(action?.attemptCount ?? 0) + (attempt?.increment ?? 0),
          };
          return Promise.resolve(action);
        }),
      findMany: jest.fn().mockResolvedValue([]),
    };
    const prisma = {
      order: {
        findUnique: jest.fn().mockImplementation(() =>
          Promise.resolve({
            id: 'local_ready',
            orderStableId: 'stable_ready',
            status: localStatus,
          }),
        ),
      },
      uberOrderAction,
      opsEvent: { create: jest.fn().mockResolvedValue(null) },
      $transaction: jest
        .fn()
        .mockImplementation(
          async (callback: (tx: unknown) => Promise<unknown>) =>
            callback({
              order: {
                updateMany: jest.fn().mockImplementation(() => {
                  if (!['paid', 'making'].includes(localStatus)) {
                    return Promise.resolve({ count: 0 });
                  }
                  localStatus = 'ready';
                  return Promise.resolve({ count: 1 });
                }),
              },
              uberOrderAction,
            }),
        ),
    };
    return { prisma, uberOrderAction };
  };

  it('ready 只在已接单后入 outbox，成功后重复 ready 不重复请求', async () => {
    const { prisma, uberOrderAction } = createReadyPrisma();
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('{}', {
        status: 200,
        headers: { 'x-request-id': 'uber-request-1' },
      }),
    );
    const service = new UberEatsService(prisma as never, createAuthService());

    await expect(
      service.syncOrderStatusToUber('ue_ready', 'ready'),
    ).resolves.toMatchObject({
      ok: true,
      action: 'READY_FOR_PICKUP',
    });
    await service.syncOrderStatusToUber('ue_ready', 'ready');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/ue_ready\/ready_for_pickup$/),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(uberOrderAction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SUCCEEDED',
          uberRequestId: 'uber-request-1',
        }) as unknown,
      }),
    );
  });

  it('ready 前未 accept 或发生并发状态变化时拒绝且不请求 Uber', async () => {
    for (const state of ['pending', 'completed']) {
      const { prisma } = createReadyPrisma(state);
      const service = new UberEatsService(prisma as never, createAuthService());
      const fetchSpy = jest.spyOn(global, 'fetch');
      await expect(
        service.syncOrderStatusToUber(`ue_${state}`, 'ready'),
      ).rejects.toThrow('必须先接单');
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  });

  it.each([
    [409, false, 'SUCCEEDED'],
    [429, true, 'FAILED'],
    [500, true, 'FAILED'],
  ])(
    'ready 处理 Uber %s：retryable=%s',
    async (status, retryable, savedStatus) => {
      const { prisma, uberOrderAction } = createReadyPrisma();
      jest.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response('{"error":"upstream"}', {
          status,
          headers: { 'uber-request-id': `request-${status}` },
        }),
      );
      const service = new UberEatsService(prisma as never, createAuthService());
      const promise = service.syncOrderStatusToUber(`ue_${status}`, 'ready');
      if (retryable)
        await expect(promise).rejects.toMatchObject({ status: 502 });
      else await expect(promise).resolves.toMatchObject({ ok: true });
      expect(uberOrderAction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: savedStatus,
            retryable,
            uberRequestId: `request-${status}`,
          }) as unknown,
        }),
      );
    },
  );

  describe('OAuth state 安全校验', () => {
    const stateInternals = (service: UberEatsService) =>
      service as unknown as {
        consumeOAuthState: (state: string, sessionId: string) => unknown;
      };

    it('拒绝过期与未来时间的 state', () => {
      const service = new UberEatsService({} as never, createAuthService());
      const nowSpy = jest.spyOn(Date, 'now');
      nowSpy.mockReturnValue(1_700_000_000_000);
      const expired = service.buildMerchantAuthorizeUrl('session_1').state;
      nowSpy.mockReturnValue(1_700_000_000_000 + 10 * 60 * 1000 + 1);
      expect(() =>
        stateInternals(service).consumeOAuthState(expired, 'session_1'),
      ).toThrow('OAuth state 已过期');

      nowSpy.mockReturnValue(1_700_000_000_000 + 120_000);
      const future = service.buildMerchantAuthorizeUrl('session_1').state;
      nowSpy.mockReturnValue(1_700_000_000_000);
      expect(() =>
        stateInternals(service).consumeOAuthState(future, 'session_1'),
      ).toThrow('OAuth state 时间戳来自未来');
    });

    it('拒绝伪造、会话不匹配和二次使用的 state', () => {
      const service = new UberEatsService({} as never, createAuthService());
      const forged = service.buildMerchantAuthorizeUrl('session_1').state;
      expect(() =>
        stateInternals(service).consumeOAuthState(`${forged}x`, 'session_1'),
      ).toThrow('OAuth state 校验失败');

      const mismatched = service.buildMerchantAuthorizeUrl('session_1').state;
      expect(() =>
        stateInternals(service).consumeOAuthState(mismatched, 'session_2'),
      ).toThrow('OAuth state 与管理员会话不匹配');

      const oneTime = service.buildMerchantAuthorizeUrl('session_1').state;
      expect(() =>
        stateInternals(service).consumeOAuthState(oneTime, 'session_1'),
      ).not.toThrow();
      expect(() =>
        stateInternals(service).consumeOAuthState(oneTime, 'session_1'),
      ).toThrow('OAuth state 不存在或已使用');
    });
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
    const service = new UberEatsService(prisma as never, createAuthService());

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
    const service = new UberEatsService(prisma as never, createAuthService());

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
    const authService = createAuthService() as unknown as {
      getAccessToken: jest.Mock<Promise<string>, [string?]>;
    };
    authService.getAccessToken.mockResolvedValue('eats-store-app-token');
    const service = new UberEatsService(prisma as never, authService as never);
    const merchantConnectionSpy = jest.spyOn(
      service as never,
      'resolveMerchantConnection' as never,
    );
    const uberApiSpy = jest
      .spyOn(service as never, 'callUberApi' as never)
      .mockResolvedValue({ resource_id: 'uploaded_menu' } as never);
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
    const service = new UberEatsService(prisma as never, authService as never);
    const uberApiSpy = jest.spyOn(service as never, 'callUberApi' as never);

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
    const service = new UberEatsService(prisma as never, createAuthService());

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
      const service = new UberEatsService({} as never, createAuthService());
      expect(service.validateUberMenuPayload(validPayload() as never)).toEqual(
        [],
      );
    });

    it('合法公网 HTTPS 图片由异步发布前检查负责，静态结构校验通过', () => {
      const payload = validPayload();
      (
        payload.items[0] as (typeof payload.items)[number] & {
          image_url?: string;
        }
      ).image_url = 'https://cdn.example.com/menu/dish.jpg';
      const service = new UberEatsService({} as never, createAuthService());
      expect(service.validateUberMenuPayload(payload as never)).toEqual([]);
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
      const service = new UberEatsService({} as never, createAuthService());
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
