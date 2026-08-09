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
import { UberHttpClient } from './uber-http.client';
import { UberConfigService } from './uber-config.service';

import { createHash, createHmac } from 'crypto';
import { AppLogger } from '../../common/app-logger';
import {
  resolveUberImageUrl,
  toUberServiceAvailability,
} from './uber-integration.base';
import { UberWebhookService } from './uber-webhook.service';

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

describe('UberWebhookService', () => {
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
    }) as unknown as ConstructorParameters<typeof UberWebhookService>[1];

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
    service: UberWebhookService,
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

    expect(
      () =>
        new UberWebhookService(
          {} as unknown as ConstructorParameters<typeof UberWebhookService>[0],
          createAuthService(),
        ),
    ).toThrow('UBER_EATS_WEBHOOK_SIGNING_KEY 未配置');
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
    const service = new UberWebhookService(
      createSignatureOnlyPrisma() as unknown as ConstructorParameters<
        typeof UberWebhookService
      >[0],
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
    const service = new UberWebhookService(
      createSignatureOnlyPrisma() as unknown as ConstructorParameters<
        typeof UberWebhookService
      >[0],
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
    const service = new UberWebhookService(
      createSignatureOnlyPrisma() as unknown as ConstructorParameters<
        typeof UberWebhookService
      >[0],
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
    const service = new UberWebhookService(
      createSignatureOnlyPrisma() as unknown as ConstructorParameters<
        typeof UberWebhookService
      >[0],
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
    const service = new UberWebhookService(
      createSignatureOnlyPrisma() as unknown as ConstructorParameters<
        typeof UberWebhookService
      >[0],
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
    const service = new UberWebhookService(
      createSignatureOnlyPrisma() as unknown as ConstructorParameters<
        typeof UberWebhookService
      >[0],
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
    const service = new UberWebhookService(
      createSignatureOnlyPrisma() as unknown as ConstructorParameters<
        typeof UberWebhookService
      >[0],
      createAuthService(),
    );
    jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
    await expect(
      verifySignature(service, rawBody, {
        'X-UbEr-SiGnAtUrE': signature,
      }),
    ).resolves.toBeUndefined();
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
    const orderEventsBus = { emitOrderPaidVerified: jest.fn() };
    const service = new UberWebhookService(
      {
        uberWebhookInbox: duplicateInbox,
        opsEvent: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
      } as unknown as ConstructorParameters<typeof UberWebhookService>[0],
      createAuthService(),
      orderEventsBus as unknown as ConstructorParameters<
        typeof UberWebhookService
      >[0],
    );
    await service.handleWebhook({
      headers: { 'x-uber-signature': signature },
      rawBody,
      body,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(orderEventsBus.emitOrderPaidVerified).not.toHaveBeenCalled();
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
    const service = new UberWebhookService(
      { uberWebhookInbox: inbox } as unknown as ConstructorParameters<
        typeof UberWebhookService
      >[0],
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
    const service = new UberWebhookService(
      { uberWebhookInbox: inbox } as unknown as ConstructorParameters<
        typeof UberWebhookService
      >[0],
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
    const service = new UberWebhookService(
      { uberWebhookInbox: inbox } as unknown as ConstructorParameters<
        typeof UberWebhookService
      >[0],
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
    const restartedService = new UberWebhookService(
      { uberWebhookInbox: inbox } as unknown as ConstructorParameters<
        typeof UberWebhookService
      >[0],
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
    const service = new UberWebhookService(
      { uberWebhookInbox: inbox, opsEvent } as unknown as ConstructorParameters<
        typeof UberWebhookService
      >[0],
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
        fetchSpy.mockImplementation(() =>
          Promise.resolve(new Response(responseBody, { status })),
        );
      }

      const service = new UberWebhookService(
        prisma as unknown as ConstructorParameters<
          typeof UberWebhookService
        >[0],
        auth,
      );
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

    const service = new UberWebhookService(
      { uberWebhookInbox: inbox, opsEvent } as unknown as ConstructorParameters<
        typeof UberWebhookService
      >[0],
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
    const service = new UberWebhookService(
      prisma as unknown as ConstructorParameters<typeof UberWebhookService>[0],
      createAuthService(),
    );
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
          reasonDetail: '订单详情无法解析',
        }) as unknown,
      }),
    );
    expect(global.fetch).toHaveBeenLastCalledWith(
      'https://api.uber.com/v1/eats/orders/ue_invalid/deny_pos_order',
      expect.objectContaining({
        body: JSON.stringify({
          reason: {
            code: 'OTHER',
            explanation: '订单详情无法解析',
          },
        }),
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

    const service = new UberWebhookService(
      prisma as unknown as ConstructorParameters<typeof UberWebhookService>[0],
      createAuthService(),
    );
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

    const service = new UberWebhookService(
      prisma as unknown as ConstructorParameters<typeof UberWebhookService>[0],
      createAuthService(),
    );
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

    const service = new UberWebhookService(
      prisma as unknown as ConstructorParameters<typeof UberWebhookService>[0],
      createAuthService(),
    );
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
    await new UberWebhookService(
      prisma as unknown as ConstructorParameters<typeof UberWebhookService>[0],
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
    await new UberWebhookService(
      prisma as unknown as ConstructorParameters<typeof UberWebhookService>[0],
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
    const service = new UberWebhookService(
      {
        uberMenuPublishVersion: { update },
      } as unknown as ConstructorParameters<typeof UberWebhookService>[0],
      authService,
    );
    const merchantConnectionSpy = jest.spyOn(
      service as unknown as ConstructorParameters<typeof UberWebhookService>[0],
      'resolveMerchantConnection' as unknown as ConstructorParameters<
        typeof UberWebhookService
      >[0],
    );
    const uberApiSpy = jest
      .spyOn(
        service as unknown as ConstructorParameters<
          typeof UberWebhookService
        >[0],
        'callUberApi' as unknown as ConstructorParameters<
          typeof UberWebhookService
        >[0],
      )
      .mockResolvedValue({
        items: [{ id: 'old_item' }],
      } as unknown as ConstructorParameters<typeof UberWebhookService>[0]);
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

  it.each([
    [401, 'UBER_ACCESS_TOKEN_INVALID'],
    [403, 'UBER_SCOPE_INSUFFICIENT'],
  ] as const)(
    '菜单 API 的 %s 鉴权失败保留结构化且脱敏的上游错误',
    async (status, code) => {
      jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'invalid_scope',
            message: 'missing eats.store; access_token=secret-token',
          }),
          { status },
        ),
      );
      const service = new UberWebhookService(
        {} as unknown as ConstructorParameters<typeof UberWebhookService>[0],
        createAuthService(),
      );

      await expect(
        (
          service as unknown as ConstructorParameters<
            typeof UberWebhookService
          >[0] as {
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
        httpStatus: status,
        uberCode: code,
        retryable: false,
        response: {
          statusCode: status,
          code,
          message: 'missing eats.store; token=[REDACTED]',
        },
      });
      jest.restoreAllMocks();
    },
  );

  it('发布确认超时保持 SUBMITTED 并创建 TIMED_OUT 运营工单', async () => {
    jest.useFakeTimers();
    const create = jest.fn().mockResolvedValue(null);
    const config = new UberConfigService({
      UBER_EATS_OAUTH_STATE_SECRET:
        'high-entropy-test-secret-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      UBER_EATS_WEBHOOK_SIGNING_KEY: 'test-ubereats-secret',
      UBER_EATS_MENU_CONFIRM_TIMEOUT_MS: '100',
      UBER_EATS_MENU_CONFIRM_INITIAL_DELAY_MS: '10',
      UBER_EATS_MENU_CONFIRM_MAX_DELAY_MS: '20',
    });
    const service = new UberWebhookService(
      {
        uberMenuPublishVersion: {
          findUnique: jest.fn().mockResolvedValue({ status: 'SUBMITTED' }),
        },
        uberOpsTicket: { create },
        opsEvent: { create: jest.fn().mockResolvedValue(null) },
      } as unknown as ConstructorParameters<typeof UberWebhookService>[0],
      createAuthService(),
      undefined,
      undefined,
      new UberHttpClient(),
      config,
    );
    jest
      .spyOn(
        service as unknown as ConstructorParameters<
          typeof UberWebhookService
        >[0],
        'confirmUploadedMenu' as unknown as ConstructorParameters<
          typeof UberWebhookService
        >[0],
      )
      .mockResolvedValue(
        'SUBMITTED' as unknown as ConstructorParameters<
          typeof UberWebhookService
        >[0],
      );
    const confirmationApi = service as unknown as MenuConfirmationTestApi;
    const polling = confirmationApi.pollUploadedMenuUntilTerminal(
      'version_timeout',
      'local_store',
      'uber_store',
      { menus: [], categories: [], items: [], modifier_groups: [] },
    );
    await jest.advanceTimersByTimeAsync(150);
    await polling;
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storeId: 'local_store',
          context: expect.objectContaining({ state: 'TIMED_OUT' }) as unknown,
        }) as unknown,
      }),
    );
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
                findUnique: jest
                  .fn()
                  .mockImplementation(() =>
                    Promise.resolve({ status: localStatus }),
                  ),
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
});
