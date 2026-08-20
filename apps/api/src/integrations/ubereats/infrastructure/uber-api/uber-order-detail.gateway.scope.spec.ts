import { UberOrderDetailGatewayAdapter } from './uber-order-detail.gateway';

describe('Uber Order Fulfillment 1.0.0 detail scope', () => {
  const setup = () => {
    const inspect = jest.fn().mockResolvedValue({
      response: new Response('{}', { status: 200 }),
      data: {},
      text: '{}',
    });
    const adapter = new UberOrderDetailGatewayAdapter(
      {
        pathFromResourceHref: jest
          .fn()
          .mockResolvedValue('/v1/delivery/order/order-1'),
        inspect,
      } as never,
      { workflowLog: jest.fn() } as never,
    );
    return { adapter, inspect };
  };

  it('always requests eats.order for the v1 immediate order detail', async () => {
    const { adapter, inspect } = setup();

    await adapter.fetchOrderDetail({
      resourceHref: 'https://api.uber.com/v1/delivery/order/order-1',
      eventType: 'orders.notification',
      eventId: 'event-1',
      resourceId: 'order-1',
    });

    expect(inspect).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/v1/delivery/order/order-1?expand=carts%2Cpayment',
        scope: 'eats.order',
      }),
    );
  });

  it('adds deliveries expansion for a scheduled order detail', async () => {
    const { adapter, inspect } = setup();

    await adapter.fetchOrderDetail({
      resourceHref: 'https://api.uber.com/v1/delivery/order/order-1',
      eventType: 'orders.scheduled.notification',
      eventId: 'event-2',
      resourceId: 'order-1',
    });

    expect(inspect).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/v1/delivery/order/order-1?expand=carts%2Cpayment%2Cdeliveries',
        scope: 'eats.order',
      }),
    );
  });
});
