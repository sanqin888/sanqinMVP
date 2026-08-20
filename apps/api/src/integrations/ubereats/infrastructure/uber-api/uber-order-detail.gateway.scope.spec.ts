import { UberOrderDetailGatewayAdapter } from './uber-order-detail.gateway';

describe('Uber Order Fulfillment 1.0.0 detail scope', () => {
  it('always requests eats.order for the v1 order detail', async () => {
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
});
