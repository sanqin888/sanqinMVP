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
    };
    return {
      service: new PosOrdersService(orders as never, uberEats as never),
      orders,
      uberEats,
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
});
