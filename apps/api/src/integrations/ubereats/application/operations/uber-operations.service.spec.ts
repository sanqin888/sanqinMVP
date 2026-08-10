/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers cross a dynamic boundary */
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
  UberOpsTicketType: {
    STORE_STATUS_SYNC: 'STORE_STATUS_SYNC',
    ORDER_STATUS_SYNC: 'ORDER_STATUS_SYNC',
    MENU_PUBLISH: 'MENU_PUBLISH',
    MENU_ITEM_AVAILABILITY: 'MENU_ITEM_AVAILABILITY',
  },
  PaymentMethod: { UBEREATS: 'UBEREATS' },
}));

import { UberOperationsPrismaAdapter } from '../../infrastructure/persistence/uber-operations-prisma.adapter';
import { createUberOperationsPrismaAdapter } from '../../test/uber-service-test.helpers';

describe('UberOperationsPrismaAdapter', () => {
  const clientSecret = 'test-ubereats-secret';
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

    const service = createUberOperationsPrismaAdapter(
      prisma as unknown as ConstructorParameters<
        typeof UberOperationsPrismaAdapter
      >[0],
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
          context: { uberStoreId: 'store_1', targetStatus: 'ONLINE' },
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

    const service = createUberOperationsPrismaAdapter(
      prisma as unknown as ConstructorParameters<
        typeof UberOperationsPrismaAdapter
      >[0],
      undefined,
      undefined,
      {
        syncStoreStatusToUber: jest.fn().mockResolvedValue({ ok: true }),
      } as unknown as ConstructorParameters<
        typeof UberOperationsPrismaAdapter
      >[3],
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

    const service = createUberOperationsPrismaAdapter(
      prisma as unknown as ConstructorParameters<
        typeof UberOperationsPrismaAdapter
      >[0],
    );
    await expect(
      service.createOpsTicket({
        type: 'STORE_STATUS_SYNC',
        title: '门店状态同步失败',
        storeId: 'default',
        context: { uberStoreId: 'store_1', targetStatus: 'ONLINE' },
      }),
    ).resolves.toMatchObject({
      ok: true,
      priority: 'MEDIUM',
    });
  });

  it.each(['paid', 'ready', 'completed'])(
    '按 context 中的目标状态重试订单：%s',
    async (targetStatus) => {
      const syncOrderStatusToUber = jest.fn().mockResolvedValue({ ok: true });
      const prisma = retryPrisma({
        type: 'ORDER_STATUS_SYNC',
        externalOrderId: 'order_1',
        context: { targetStatus },
      });
      const service = makeRetryService(prisma, {
        orders: { syncOrderStatusToUber },
      });
      await service.retryOpsTicket('tic_retry');
      expect(syncOrderStatusToUber).toHaveBeenCalledWith(
        'order_1',
        targetStatus,
      );
    },
  );

  it.each([true, false])(
    '按 context 重试商品上/下架：%s',
    async (isAvailable) => {
      const syncUberMenuItemAvailability = jest
        .fn()
        .mockResolvedValue({ ok: true });
      const prisma = retryPrisma({
        type: 'MENU_ITEM_AVAILABILITY',
        menuItemStableId: 'item_1',
        context: { isAvailable },
      });
      const service = makeRetryService(prisma, {
        menu: { syncUberMenuItemAvailability },
      });
      await service.retryOpsTicket('tic_retry');
      expect(syncUberMenuItemAvailability).toHaveBeenCalledWith(
        expect.objectContaining({ isAvailable }),
      );
    },
  );

  it.each([
    ['ORDER_STATUS_SYNC', undefined],
    ['ORDER_STATUS_SYNC', { targetStatus: 'not-a-status' }],
    ['MENU_ITEM_AVAILABILITY', { isAvailable: 'yes' }],
  ])('context 缺失或非法时保持 OPEN：%s', async (type, context) => {
    const prisma = retryPrisma({
      type,
      externalOrderId: 'order_1',
      menuItemStableId: 'item_1',
      context,
    });
    const service = makeRetryService(prisma);
    await expect(service.retryOpsTicket('tic_retry')).resolves.toMatchObject({
      ok: false,
      status: 'OPEN',
    });
    expect(prisma.uberOpsTicket.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'OPEN' }),
      }),
    );
  });

  it('上游重试失败后仍保持 OPEN', async () => {
    const prisma = retryPrisma({
      type: 'ORDER_STATUS_SYNC',
      externalOrderId: 'order_1',
      context: { targetStatus: 'ready' },
    });
    const service = makeRetryService(prisma, {
      orders: {
        syncOrderStatusToUber: jest
          .fn()
          .mockRejectedValue(new Error('upstream failed')),
      },
    });
    await expect(service.retryOpsTicket('tic_retry')).resolves.toMatchObject({
      ok: false,
      status: 'OPEN',
      lastError: 'upstream failed',
    });
  });

  function retryPrisma(ticket: Record<string, unknown>) {
    return {
      uberOpsTicket: {
        findUnique: jest.fn().mockResolvedValue({
          ticketStableId: 'tic_retry',
          storeId: 'default',
          ...ticket,
        }),
        update: jest
          .fn()
          .mockResolvedValueOnce({})
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({
              ticketStableId: 'tic_retry',
              status: data.status,
              retryCount: 1,
              lastError: data.lastError ?? null,
              resolvedAt: data.resolvedAt ?? null,
            }),
          ),
      },
      opsEvent: { create: jest.fn().mockResolvedValue(null) },
    };
  }

  function makeRetryService(
    prisma: ReturnType<typeof retryPrisma>,
    dependencies: { orders?: object; menu?: object } = {},
  ) {
    return createUberOperationsPrismaAdapter(
      prisma as unknown as ConstructorParameters<
        typeof UberOperationsPrismaAdapter
      >[0],
      dependencies.orders as ConstructorParameters<
        typeof UberOperationsPrismaAdapter
      >[1],
      dependencies.menu as ConstructorParameters<
        typeof UberOperationsPrismaAdapter
      >[2],
    );
  }
});

describe('UberOperationsPrismaAdapter 最小依赖装配', () => {
  it('构造函数只声明 Prisma、订单、菜单与商户服务', () => {
    expect(UberOperationsPrismaAdapter.length).toBe(4);
  });
  it('运营编排不读取任何 Uber 敏感配置', () => {
    expect(() => createUberOperationsPrismaAdapter({} as never)).not.toThrow();
  });
});
