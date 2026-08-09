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

import { UberConfigService } from './uber-config.service';
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

describe('UberMerchantService', () => {
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
      service as unknown as {
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
    const result = await service.getMerchantStores(undefined, 'merchant_1');

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
      undefined,
      'store_1',
      { pos_store_id: 'pos_1' },
      'merchant_1',
    );

    expect(result.ok).toBe(true);
    expect(result.isProvisioned).toBe(true);
    expect(prisma.uberStoreMapping.upsert).toHaveBeenCalled();
  });
});

describe('UberMerchantService 最小依赖装配', () => {
  it('构造函数只声明 Prisma、认证、HTTP 与 OAuth 配置', () => {
    expect(UberMerchantService.length).toBe(5);
  });
  it('OAuth 能力缺少 state 密钥时在构造边界快速失败，但不要求 webhook 密钥', () => {
    const valid = new UberConfigService({
      UBER_EATS_OAUTH_STATE_SECRET: '0123456789abcdef0123456789ABCDEF',
    });
    expect(() =>
      createUberMerchantService({} as never, {} as never, undefined, valid),
    ).not.toThrow();
    expect(() =>
      createUberMerchantService(
        {} as never,
        {} as never,
        undefined,
        new UberConfigService(),
      ),
    ).toThrow('UBER_EATS_OAUTH_STATE_SECRET');
  });
});
