import { OrderStatus } from '@prisma/client';
import { UberEatsService } from './ubereats.service';

describe('UberEatsService', () => {
  it('接收订单 webhook 时会写入 ubereats 订单并返回 orderStableId', async () => {
    const prisma = {
      order: {
        upsert: jest.fn().mockResolvedValue({ orderStableId: 'ord_uber_1' }),
      },
      analyticsEvent: {
        create: jest.fn().mockResolvedValue(null),
      },
      businessConfig: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          isTemporarilyClosed: false,
          temporaryCloseReason: null,
          updatedAt: new Date(),
        }),
      },
    };

    const service = new UberEatsService(prisma as never);
    const result = await service.handleWebhook({
      headers: {},
      rawBody: '{"event_type":"orders.accepted"}',
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

    expect(result.processed).toBe(true);
    expect(result.orderStableId).toBe('ord_uber_1');
    expect(prisma.order.upsert).toHaveBeenCalled();
  });

  it('同步订单状态时，找不到订单会返回失败', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      analyticsEvent: {
        create: jest.fn().mockResolvedValue(null),
      },
      businessConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 1,
          storeName: '',
          isTemporarilyClosed: false,
          temporaryCloseReason: null,
          updatedAt: new Date(),
        }),
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
});
