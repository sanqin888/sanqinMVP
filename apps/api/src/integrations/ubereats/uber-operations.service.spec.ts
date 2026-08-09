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
import { UberOperationsService } from './uber-operations.service';

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

describe('UberOperationsService', () => {
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
    }) as unknown as ConstructorParameters<typeof UberOperationsService>[1];

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
    service: UberOperationsService,
    rawBody: string,
    headers: Record<string, unknown>,
  ) =>
    service.handleWebhook({
      headers,
      rawBody,
      body: { event_type: 'orders.notification', event_id: 'fixed-event' },
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

    const service = new UberOperationsService(
      prisma as unknown as ConstructorParameters<
        typeof UberOperationsService
      >[0],
      createAuthService(),
    );
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

    const service = new UberOperationsService(
      prisma as unknown as ConstructorParameters<
        typeof UberOperationsService
      >[0],
      createAuthService(),
    );
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

    const service = new UberOperationsService(
      prisma as unknown as ConstructorParameters<
        typeof UberOperationsService
      >[0],
      createAuthService(),
    );
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
