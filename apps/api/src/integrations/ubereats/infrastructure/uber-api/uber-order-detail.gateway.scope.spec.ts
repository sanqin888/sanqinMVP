import {
  UberOrderDetailGatewayAdapter,
  orderReadScope,
} from './uber-order-detail.gateway';

describe('UberOrderDetailGatewayAdapter order read scopes', () => {
  it.each([
    ['/v1/delivery/order/order-1', 'eats.order'],
    ['/v1/delivery/order/order-1?expand=carts', 'eats.order'],
    ['/v2/eats/order/order-1', 'eats.store.orders.read'],
  ] as const)('maps %s to %s', (path, scope) => {
    expect(orderReadScope(path)).toBe(scope);
  });

  it(
    'uses eats.order when a scheduled webhook points to v1 order details',
    async () => {
      const inspect = jest.fn().mockResolvedValue({
        response: new Response(null, { status: 401 }),
        data: {},
        text: '',
      });
      const adapter = new UberOrderDetailGatewayAdapter(
        {
          pathFromResourceHref: jest
            .fn()
            .mockResolvedValue('/v1/delivery/order/order-1'),
          inspect,
        },
        { workflowLog: jest.fn() },
      );

      await expect(
        adapter.fetchOrderDetail({
          resourceHref: 'https://api.uber.com/v1/delivery/order/order-1',
          eventType: 'orders.scheduled.notification',
          eventId: 'event-1',
          resourceId: 'order-1',
        }),
      ).rejects.toMatchObject({ code: 'UBER_ACCESS_TOKEN_INVALID' });

      expect(inspect).toHaveBeenCalledWith({
        path: '/v1/delivery/order/order-1?expand=carts%2Cpayment',
        method: 'GET',
        operation: 'uber.order.detail',
        scope: 'eats.order',
        kind: 'orderDetail',
      });
    },
  );
});
