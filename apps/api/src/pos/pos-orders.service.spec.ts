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
      createAmendment: jest.fn().mockResolvedValue(current),
      createFullRefund: jest.fn().mockResolvedValue({
        order: { ...current, status: 'refunded' },
        outcome: 'refunded',
      }),
    };
    const uberEats = {
      execute: jest.fn().mockResolvedValue({
        ok: true,
        actionResult: { status: 'SUCCEEDED', actionId: 'action_1' },
      }),
      accept: jest.fn().mockResolvedValue({ ok: true }),
      cancel: jest.fn().mockResolvedValue({ ok: true }),
      getReadyForPickupAction: jest.fn().mockResolvedValue(null),
      retryReadyForPickup: jest.fn(),
    };
    const prisma = {
      order: { findUnique: jest.fn() },
      orderAmendment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return {
      service: new PosOrdersService(
        orders as never,
        uberEats as never,
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
    expect(uberEats.execute).not.toHaveBeenCalled();
  });

  it('Uber pending 使用 ACCEPT 并直接重新读取 making 订单', async () => {
    const pending = order({
      channel: 'ubereats',
      clientRequestId: 'ubereats:external-123',
      status: 'pending',
    });
    const making = order({
      channel: 'ubereats',
      clientRequestId: 'ubereats:external-123',
      status: 'making',
    });
    const { service, orders, uberEats } = setup(pending);
    orders.getByStableId
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(making);

    await expect(service.advance('order_1')).resolves.toMatchObject(making);

    expect(uberEats.accept).toHaveBeenCalledWith('external-123');
    expect(orders.advance).not.toHaveBeenCalled();
  });

  it('Uber ACCEPT 失败时不提前推进本地 pending 状态', async () => {
    const pending = order({
      channel: 'ubereats',
      clientRequestId: 'ubereats:external-123',
      status: 'pending',
    });
    const { service, orders, uberEats } = setup(pending);
    uberEats.accept.mockResolvedValue({ ok: false });

    await expect(service.advance('order_1')).resolves.toMatchObject(pending);

    expect(orders.getByStableId).toHaveBeenCalledTimes(1);
    expect(orders.advance).not.toHaveBeenCalled();
  });

  it('两个终端同时点击时都复用 Uber ACCEPT/outbox 而不走通用推进', async () => {
    const pending = order({
      channel: 'ubereats',
      clientRequestId: 'ubereats:external-123',
      status: 'pending',
    });
    const making = { ...pending, status: 'making' } as OrderDto;
    const { service, orders, uberEats } = setup(pending);
    orders.getByStableId
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(pending)
      .mockResolvedValue(making);

    await Promise.all([service.advance('order_1'), service.advance('order_1')]);

    expect(uberEats.accept).toHaveBeenCalledTimes(2);
    expect(orders.advance).not.toHaveBeenCalled();
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

    await expect(service.advance('order_1')).resolves.toMatchObject(ready);

    expect(uberEats.execute).toHaveBeenCalledWith('external-123', 'ready');
    expect(orders.advance).not.toHaveBeenCalled();
  });

  it('重复 ready 点击复用 Uber 服务的幂等动作键', async () => {
    const { service, orders, uberEats } = setup(
      order({ channel: 'ubereats', clientRequestId: 'ubereats:external-123' }),
    );

    await service.advance('order_1');
    await service.advance('order_1');

    expect(uberEats.execute).toHaveBeenCalledTimes(2);
    expect(orders.advance).not.toHaveBeenCalled();
  });

  it('Uber 临时失败返回部分成功契约而不是通用 502', async () => {
    const { service, orders, uberEats } = setup(
      order({ channel: 'ubereats', clientRequestId: 'ubereats:external-123' }),
    );
    uberEats.execute.mockResolvedValue({
      ok: true,
      actionResult: {
        status: 'FAILED',
        retryable: true,
        actionId: 'ready_action',
        errorSummary: 'Uber 返回 HTTP 500',
      },
    });
    orders.getByStableId
      .mockResolvedValueOnce(
        order({
          channel: 'ubereats',
          clientRequestId: 'ubereats:external-123',
          status: 'making',
        }),
      )
      .mockResolvedValueOnce(
        order({
          channel: 'ubereats',
          clientRequestId: 'ubereats:external-123',
          status: 'ready',
        }),
      );

    await expect(service.advance('order_1')).resolves.toMatchObject({
      status: 'ready',
      uberActionStatus: 'FAILED',
      retryable: true,
      actionId: 'ready_action',
    });
    expect(orders.advance).not.toHaveBeenCalled();
  });

  it('Uber ready 到 completed 与 Uber action 状态完全脱钩', async () => {
    const ready = order({
      channel: 'ubereats',
      clientRequestId: 'ubereats:external-123',
      status: 'ready',
    });
    const completed = { ...ready, status: 'completed' } as OrderDto;
    const { service, orders, uberEats } = setup(ready);
    orders.advance.mockResolvedValue(completed);
    uberEats.getReadyForPickupAction.mockResolvedValue({
      ok: false,
      actionId: 'ready_action',
      status: 'FAILED',
      retryable: true,
      error: {
        code: 'UNKNOWN',
        message: 'timeout',
        retryable: true,
      },
    });

    await expect(service.advance('order_1')).resolves.toMatchObject({
      status: 'completed',
    });

    expect(orders.advance).toHaveBeenCalledWith('order_1');
    expect(uberEats.getReadyForPickupAction).not.toHaveBeenCalled();
    expect(uberEats.execute).not.toHaveBeenCalled();
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
    expect(uberEats.execute).not.toHaveBeenCalled();
  });

  it('POS 允许店员为已接单的 Uber 订单提交 CANCEL', async () => {
    const { service, uberEats } = setup(
      order({
        channel: 'ubereats',
        clientRequestId: 'ubereats:external-123',
        status: 'making',
      }),
    );

    await expect(
      service.cancelUberOrder('order_1', '商品售罄'),
    ).resolves.toMatchObject({
      orderStableId: 'order_1',
      uberActionStatus: null,
    });
    expect(uberEats.cancel).toHaveBeenCalledWith('external-123', '商品售罄');
    expect('denyUberOrder' in uberEats).toBe(false);
  });

  it('POS 拒绝为非 Uber 订单提交 CANCEL', async () => {
    const { service, uberEats } = setup(order());

    await expect(service.cancelUberOrder('order_1')).rejects.toThrow(
      '只有 Uber 订单可以提交取消',
    );
    expect(uberEats.cancel).not.toHaveBeenCalled();
  });

  it('Web 订单保留管理入口但 capability 全部置灰等待 Clover 同步', async () => {
    const { service } = setup(order({ channel: 'web' }));

    await expect(service.getManagementActions('order_1')).resolves.toEqual({
      actions: [
        {
          action: 'SWAP_ITEM',
          available: false,
          reason: 'CLOVER_SYNC_PENDING',
        },
        {
          action: 'VOID_ITEM',
          available: false,
          reason: 'CLOVER_SYNC_PENDING',
        },
        {
          action: 'FULL_REFUND',
          available: false,
          reason: 'CLOVER_SYNC_PENDING',
        },
        {
          action: 'CHANGE_PAYMENT',
          available: false,
          reason: 'CLOVER_SYNC_PENDING',
        },
      ],
    });
  });

  it('Uber 订单只暴露集成 CANCEL，不暴露本地退款/换菜/改支付方式', async () => {
    const { service } = setup(
      order({
        channel: 'ubereats',
        clientRequestId: 'ubereats:external-123',
        status: 'making',
      }),
    );

    await expect(service.getManagementActions('order_1')).resolves.toEqual({
      actions: [{ action: 'UBER_CANCEL', available: true }],
    });
  });

  it('店内人工改单要求操作人并复用现有 amendment 事务', async () => {
    const { service, orders } = setup(order());

    await expect(
      service.createAmendment('order_1', {
        type: 'RETENDER',
        reason: '支付方式调整',
        operatorName: 'Li',
        paymentMethod: 'CASH',
        refundGrossCents: 2599,
        additionalChargeCents: 2599,
        items: [],
      }),
    ).resolves.toMatchObject({ orderStableId: 'order_1' });

    expect(orders.createAmendment).toHaveBeenCalledWith(
      expect.objectContaining({
        orderStableId: 'order_1',
        reason: '支付方式调整 · 操作人:Li',
      }),
    );
  });

  it('店内人工改单缺少操作人时拒绝写入', async () => {
    const { service, orders } = setup(order());

    await expect(
      service.createAmendment('order_1', {
        type: 'RETENDER',
        reason: '支付方式调整',
        operatorName: ' ',
        paymentMethod: 'CASH',
        refundGrossCents: 2599,
        additionalChargeCents: 2599,
        items: [],
      }),
    ).rejects.toThrow('operatorName is required');
    expect(orders.createAmendment).not.toHaveBeenCalled();
  });

  it('Web/Uber 不能绕过 capability 调通用 POS amendment', async () => {
    const web = setup(order({ channel: 'web' }));
    await expect(
      web.service.createAmendment('order_1', {
        type: 'RETENDER',
        reason: 'test',
        operatorName: 'Li',
      }),
    ).rejects.toThrow('Web order management is disabled');
    expect(web.orders.createAmendment).not.toHaveBeenCalled();

    const uber = setup(order({ channel: 'ubereats' }));
    await expect(
      uber.service.createAmendment('order_1', {
        type: 'RETENDER',
        reason: 'test',
        operatorName: 'Li',
      }),
    ).rejects.toThrow('Uber orders must use the integrated Uber action flow');
    expect(uber.orders.createAmendment).not.toHaveBeenCalled();
  });
});
