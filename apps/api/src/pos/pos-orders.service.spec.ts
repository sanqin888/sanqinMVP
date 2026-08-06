import type { OrderDto } from '../orders/dto/order.dto';
import { PosOrdersService } from './pos-orders.service';

const order = (overrides: Partial<OrderDto> = {}): OrderDto =>
  ({
    orderStableId: 'order_1',
    orderNumber: 'SQ1',
    clientRequestId: 'SQ1',
    status: 'making',
    channel: 'in_store',
    items: [],
    ...overrides,
  }) as OrderDto;

describe('PosOrdersService', () => {
  const setup = (current: OrderDto) => {
    const orders = {
      getByStableId: jest.fn().mockResolvedValue(current),
      advance: jest.fn().mockResolvedValue({ ...current, status: 'ready' }),
    };
    const uberEats = {
      syncOrderStatusToUber: jest.fn().mockResolvedValue({ ok: true }),
      denyUberOrder: jest
        .fn()
        .mockResolvedValue({ ok: true, duplicate: false }),
    };
    const prisma = {
      uberOrderAction: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    return {
      service: new PosOrdersService(
        orders as never,
        uberEats as never,
        prisma as never,
      ),
      orders,
      uberEats,
      prisma,
    };
  };

  it('普通订单仅使用本地状态推进', async () => {
    const { service, orders, uberEats } = setup(order());

    await service.advance('order_1');

    expect(orders.advance).toHaveBeenCalledWith('order_1');
    expect(uberEats.syncOrderStatusToUber).not.toHaveBeenCalled();
  });

  it('Uber webhook 订单从 making 到 ready 时委托原子 outbox 同步', async () => {
    const ready = order({
      channel: 'ubereats',
      clientRequestId: 'ubereats:external-123',
      status: 'ready',
    });
    const { service, orders, uberEats } = setup(
      order({ channel: 'ubereats', clientRequestId: 'ubereats:external-123' }),
    );
    orders.getByStableId.mockResolvedValueOnce(
      order({ channel: 'ubereats', clientRequestId: 'ubereats:external-123' }),
    );
    orders.getByStableId.mockResolvedValueOnce(ready);

    await expect(service.advance('order_1')).resolves.toBe(ready);

    expect(uberEats.syncOrderStatusToUber).toHaveBeenCalledWith(
      'external-123',
      'ready',
    );
    expect(orders.advance).not.toHaveBeenCalled();
  });

  it('重复 ready 点击复用 Uber 服务的幂等动作键', async () => {
    const { service, orders, uberEats } = setup(
      order({ channel: 'ubereats', clientRequestId: 'ubereats:external-123' }),
    );

    await service.advance('order_1');
    await service.advance('order_1');

    expect(uberEats.syncOrderStatusToUber).toHaveBeenCalledTimes(2);
    expect(orders.advance).not.toHaveBeenCalled();
  });

  it('Uber 临时失败时不绕过 outbox 执行本地推进', async () => {
    const { service, orders, uberEats } = setup(
      order({ channel: 'ubereats', clientRequestId: 'ubereats:external-123' }),
    );
    uberEats.syncOrderStatusToUber.mockRejectedValue(
      new Error('temporary Uber failure'),
    );

    await expect(service.advance('order_1')).rejects.toThrow(
      'temporary Uber failure',
    );
    expect(orders.advance).not.toHaveBeenCalled();
  });

  it('Uber ready 到 completed 只在本地完成，不构造外部动作', async () => {
    const { service, orders, uberEats } = setup(
      order({
        channel: 'ubereats',
        clientRequestId: 'ubereats:external-123',
        status: 'ready',
      }),
    );

    await service.advance('order_1');

    expect(orders.advance).toHaveBeenCalledWith('order_1');
    expect(uberEats.syncOrderStatusToUber).not.toHaveBeenCalled();
  });

  it('接单前使用 DENY outbox 拒绝 Uber 订单', async () => {
    const { service, uberEats } = setup(
      order({
        channel: 'ubereats',
        clientRequestId: 'ubereats:external-123',
        status: 'pending',
      }),
    );

    await expect(
      service.cancelUberOrder('order_1', 'ITEM_SOLD_OUT', '午餐已售罄'),
    ).resolves.toEqual({ ok: true, outcome: 'confirmed', duplicate: false });
    expect(uberEats.denyUberOrder).toHaveBeenCalledWith(
      'external-123',
      'ITEM_SOLD_OUT',
      '午餐已售罄',
    );
  });

  it('已有 ACCEPT 记录时返回人工处理边界且不修改本地状态', async () => {
    const { service, orders, uberEats, prisma } = setup(
      order({
        channel: 'ubereats',
        clientRequestId: 'ubereats:external-123',
        status: 'making',
      }),
    );
    prisma.uberOrderAction.findUnique
      .mockResolvedValueOnce({ status: 'SUCCEEDED' })
      .mockResolvedValueOnce(null);

    await expect(
      service.cancelUberOrder('order_1', 'TOO_BUSY', '门店繁忙'),
    ).rejects.toMatchObject({ response: { manualActionRequired: true } });
    expect(uberEats.denyUberOrder).not.toHaveBeenCalled();
    expect(orders.advance).not.toHaveBeenCalled();
  });

  it('重复请求复用已有 DENY 幂等动作', async () => {
    const { service, uberEats, prisma } = setup(
      order({
        channel: 'ubereats',
        clientRequestId: 'ubereats:external-123',
        status: 'pending',
      }),
    );
    prisma.uberOrderAction.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(
        where.externalOrderId_action.action === 'DENY'
          ? { status: 'SUCCEEDED', retryable: false }
          : null,
      ),
    );
    uberEats.denyUberOrder.mockResolvedValue({ ok: true, duplicate: true });

    await expect(
      service.cancelUberOrder('order_1', 'TOO_BUSY', '门店繁忙'),
    ).resolves.toMatchObject({ duplicate: true, outcome: 'confirmed' });
  });

  it('Uber 临时失败仅返回可靠入队，不把本地订单标为取消', async () => {
    const { service, orders, uberEats, prisma } = setup(
      order({
        channel: 'ubereats',
        clientRequestId: 'ubereats:external-123',
        status: 'pending',
      }),
    );
    uberEats.denyUberOrder.mockRejectedValue(new Error('Uber timeout'));
    prisma.uberOrderAction.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ status: 'FAILED', retryable: true });

    await expect(
      service.cancelUberOrder('order_1', 'TOO_BUSY', '门店繁忙'),
    ).resolves.toMatchObject({ outcome: 'queued' });
    expect(orders.advance).not.toHaveBeenCalled();
  });

  it('非 Uber 订单不能调用专用接口', async () => {
    const { service, uberEats } = setup(order());
    await expect(
      service.cancelUberOrder('order_1', 'TOO_BUSY', '门店繁忙'),
    ).rejects.toMatchObject({ response: { code: 'NOT_UBER_ORDER' } });
    expect(uberEats.denyUberOrder).not.toHaveBeenCalled();
  });
});
