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
      execute: jest.fn().mockResolvedValue({
        ok: true,
        actionResult: { status: 'SUCCEEDED', actionId: 'action_1' },
      }),
      accept: jest.fn().mockResolvedValue({ ok: true }),
      deny: jest.fn().mockResolvedValue({ ok: false, status: 'QUEUED' }),
      cancel: jest.fn().mockResolvedValue({ ok: true }),
      getReadyForPickupAction: jest.fn().mockResolvedValue(null),
      retryReadyForPickup: jest.fn(),
    };
    return {
      service: new PosOrdersService(
        orders as never,
        uberEats as never,
        uberEats as never,
        {} as never,
      ),
      orders,
      uberEats,
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

  it('POS 允许店员拒绝仍处于 pending 的 Uber 订单', async () => {
    const { service, uberEats } = setup(
      order({
        channel: 'ubereats',
        clientRequestId: 'ubereats:external-123',
        status: 'pending',
      }),
    );

    await expect(
      service.denyUberOrder('order_1', 'ITEM_ISSUE', '商品售罄'),
    ).resolves.toMatchObject({
      orderStableId: 'order_1',
      uberActionStatus: 'QUEUED',
    });
    expect(uberEats.deny).toHaveBeenCalledWith(
      'external-123',
      'ITEM_ISSUE',
      '商品售罄',
    );
    await expect(service.getManagementActions('order_1')).resolves.toEqual({
      actions: [{ action: 'UBER_DENY', available: true }],
    });
  });

  it('POS 不允许对已接单 Uber 订单再提交 DENY', async () => {
    const { service, uberEats } = setup(
      order({
        channel: 'ubereats',
        clientRequestId: 'ubereats:external-123',
        status: 'making',
      }),
    );

    await expect(
      service.denyUberOrder('order_1', 'OTHER'),
    ).rejects.toThrow('只有待接单的 Uber 订单可以拒单');
    expect(uberEats.deny).not.toHaveBeenCalled();
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
  });

  it('POS 在 Uber 订单 ready 后不再提供 CANCEL，避免上游成功但本地无法进入退款终态', async () => {
    const ready = order({
      channel: 'ubereats',
      clientRequestId: 'ubereats:external-123',
      status: 'ready',
    });
    const { service, uberEats } = setup(ready);

    await expect(service.cancelUberOrder('order_1')).rejects.toThrow(
      '当前 Uber 订单状态不允许取消',
    );
    await expect(service.getManagementActions('order_1')).resolves.toEqual({
      actions: [
        {
          action: 'UBER_CANCEL',
          available: false,
          reason: 'ORDER_STATUS_NOT_SUPPORTED',
        },
      ],
    });
    expect(uberEats.cancel).not.toHaveBeenCalled();
  });

  it('POS 拒绝为非 Uber 订单提交 CANCEL', async () => {
    const { service, uberEats } = setup(order());

    await expect(service.cancelUberOrder('order_1')).rejects.toThrow(
      '只有 Uber 订单可以提交取消',
    );
    expect(uberEats.cancel).not.toHaveBeenCalled();
  });
});
