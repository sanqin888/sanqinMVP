import { UberOrderDetailGatewayAdapter } from './uber-order-detail.gateway';

type WorkflowLog = (
  level: 'debug' | 'log' | 'warn' | 'error',
  message?: unknown,
  details?: Record<string, unknown>,
) => void;

describe('UberOrderDetailGatewayAdapter diagnostics', () => {
  it('records only Order Fulfillment v1 field shapes when detail mapping fails', async () => {
    const workflowLog = jest.fn<WorkflowLog>();
    const secret = 'Bearer fixture-sensitive-token';
    const adapter = new UberOrderDetailGatewayAdapter(
      {
        pathFromResourceHref: jest
          .fn()
          .mockResolvedValue('/v1/delivery/order/order-1'),
        inspect: jest.fn().mockResolvedValue({
          response: new Response(null, { status: 200 }),
          data: {
            order: {
              id: 'order-1',
              carts: [
                {
                  items: [
                    {
                      id: 'item-1',
                      cart_item_id: 'cart-item-1',
                      quantity: { amount: 1 },
                    },
                  ],
                },
              ],
              payment: {},
            },
            authorization: secret,
          },
          text: '',
        }),
      },
      { workflowLog },
    );

    await expect(
      adapter.fetchOrderDetail({
        resourceHref: 'https://api.uber.com/v1/delivery/order/order-1',
        eventType: 'orders.notification',
        eventId: 'event-1',
        resourceId: 'order-1',
      }),
    ).resolves.toEqual({ kind: 'invalid', reason: 'MISSING_TOTAL' });

    expect(workflowLog).toHaveBeenCalledWith(
      'error',
      '[ubereats order] detail invalid category=mapping reason=MISSING_TOTAL',
    );
    expect(workflowLog).toHaveBeenCalledWith(
      'error',
      '[ubereats order] detail shape',
      {
        operation: 'order.detail.shape',
        contract: 'order-fulfillment-1.0.0',
        eventType: 'orders.notification',
        rootType: 'object',
        topLevelKeys: 'carts,id,payment',
        orderIdShape: 'string',
        cartsShape: 'array(1)',
        customersShape: 'missing',
        deliveriesShape: 'missing',
        paymentShape: 'object',
        paymentDetailShape: 'missing',
        orderTotalShape: 'missing',
        itemChargesShape: 'missing',
        priceBreakdownShape: 'missing',
        preparationTimeShape: 'missing',
      },
    );
    expect(JSON.stringify(workflowLog.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(workflowLog.mock.calls)).not.toContain(
      'authorization',
    );
  });
});
