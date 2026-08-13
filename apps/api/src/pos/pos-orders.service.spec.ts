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

  it('ready 同步失败后重复点击不会推进 completed', async () => {
    const ready = order({
      channel: 'ubereats',
      clientRequestId: 'ubereats:external-123',
      status: 'ready',
    });
    const { service, orders, uberEats } = setup(ready);
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
      status: 'ready',
      uberActionStatus: 'FAILED',
      actionId: 'ready_action',
    });
    expect(orders.advance).not.toHaveBeenCalled();
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

  it('Uber 新订单由 webhook 落库后自动接单，POS 服务不承担 DENY 决策', () => {
    const { service, uberEats } = setup(
      order({
        channel: 'ubereats',
        clientRequestId: 'ubereats:external-123',
        status: 'making',
      }),
    );

    expect(
      'cancelUberOrder' in (service as unknown as Record<string, unknown>),
    ).toBe(false);
    expect('denyUberOrder' in uberEats).toBe(false);
  });

  it('接单后人工退款要求凭证并在同一事务写入全额调整', async () => {
    const current = order({
      channel: 'ubereats',
      clientRequestId: 'ubereats:external-123',
      status: 'completed',
    });
    const orders = { getByStableId: jest.fn().mockResolvedValue(current) };
    const tx = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-db-id',
          orderStableId: 'order_1',
          channel: 'ubereats',
          status: 'completed',
          totalCents: 2599,
        }),
        update: jest.fn(),
      },
      orderAmendment: { upsert: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new PosOrdersService(
      orders as never,
      {} as never,
      {} as never,
      prisma as never,
    );

    await expect(
      service.recordManualUberRefund('order_1', {
        reason: '顾客取消',
        evidence: 'Uber case UE-42, staff Li, 12:30 UTC',
      }),
    ).resolves.toBe(current);
    expect(tx.orderAmendment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          refundCents: 2599,
          deltaCents: -2599,
          summaryJson: expect.objectContaining({
            status: 'CONFIRMED',
            evidence: 'Uber case UE-42, staff Li, 12:30 UTC',
          }) as unknown,
        }) as unknown,
      }),
    );
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-db-id' },
      data: { status: 'refunded' },
    });
  });
});
