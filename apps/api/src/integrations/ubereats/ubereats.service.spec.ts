import {
  OrderStatus,
  UberOpsTicketPriority,
  UberOpsTicketStatus,
  UberOpsTicketType,
} from '@prisma/client';
import { UberEatsService } from './ubereats.service';

describe('UberEatsService', () => {
  const clientSecret = 'test-ubereats-secret';

  beforeEach(() => {
    process.env.UBER_EATS_CLIENT_SECRET = clientSecret;
  });

  afterEach(() => {
    delete process.env.UBER_EATS_CLIENT_SECRET;
  });

  it('接收订单 webhook 时会写入 ubereats 订单并返回 orderStableId', async () => {
    const rawBody = '{"event_type":"orders.accepted"}';
    const signature = require('crypto')
      .createHmac('sha256', clientSecret)
      .update(rawBody, 'utf8')
      .digest('hex');

    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ orderStableId: 'ord_uber_1' }),
      },
      analyticsEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new UberEatsService(prisma as never);
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

  it('同步订单状态时，找不到订单会返回失败', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      analyticsEvent: {
        create: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new UberEatsService(prisma as never);
    const result = await service.syncOrderStatusToUber(
      'ue_not_found',
      OrderStatus.ready,
    );

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
      analyticsEvent: {
        create: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new UberEatsService(prisma as never);
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
          { status: OrderStatus.paid, totalCents: 1000 },
          { status: OrderStatus.pending, totalCents: 500 },
        ]),
      },
      analyticsEvent: {
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

    const service = new UberEatsService(prisma as never);
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
          type: UberOpsTicketType.STORE_STATUS_SYNC,
          storeId: 'default',
        }),
        update: jest
          .fn()
          .mockResolvedValueOnce({})
          .mockResolvedValueOnce({
            ticketStableId: 'tic_1',
            status: UberOpsTicketStatus.RESOLVED,
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
      analyticsEvent: {
        create: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new UberEatsService(prisma as never);
    const result = await service.retryOpsTicket('tic_1');

    expect(result.ok).toBe(true);
    expect(result.status).toBe(UberOpsTicketStatus.RESOLVED);
  });

  it('创建异常工单时会按默认优先级落库', async () => {
    const prisma = {
      uberOpsTicket: {
        create: jest.fn().mockResolvedValue({
          ticketStableId: 'tic_2',
          status: UberOpsTicketStatus.OPEN,
          priority: UberOpsTicketPriority.MEDIUM,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        }),
      },
      analyticsEvent: {
        create: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new UberEatsService(prisma as never);
    const result = await service.createOpsTicket({
      type: UberOpsTicketType.STORE_STATUS_SYNC,
      title: '门店状态同步失败',
      storeId: 'default',
    });

    expect(result.ok).toBe(true);
    expect(result.priority).toBe(UberOpsTicketPriority.MEDIUM);
  });
});
