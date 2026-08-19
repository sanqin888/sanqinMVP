import { UberOrderDetailGatewayAdapter } from './uber-order-detail.gateway';

type WorkflowLog = (
  level: 'debug' | 'log' | 'warn' | 'error',
  message?: unknown,
  details?: Record<string, unknown>,
) => void;

describe('UberOrderDetailGatewayAdapter diagnostics', () => {
  it('records only field shapes when a successful order detail cannot be mapped', async () => {
    const workflowLog = jest.fn<WorkflowLog>();
    const secret = 'Bearer [REDACTED]';
    const adapter = new UberOrderDetailGatewayAdapter(
      {
        pathFromResourceHref: jest.fn().mockResolvedValue('/orders/1'),
        inspect: jest.fn().mockResolvedValue({
          response: new Response(null, { status: 200 }),
          data: {
            id: 'order-1',
            cart: { items: [{}] },
            payment: { charges: {} },
            authorization: secret,
          },
          text: '',
        }),
      },
      { workflowLog },
    );

    await expect(
      adapter.fetchOrderDetail({
        resourceHref: 'https://api.uber.com/orders/1',
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
        eventType: 'orders.notification',
        rootType: 'object',
        topLevelKeys: 'cart,id,payment',
        orderIdFields: 'id',
        totalFields: 'none',
        itemsShape: 'missing',
        cartShape: 'object',
        cartItemsShape: 'array(1)',
        cartsShape: 'missing',
        paymentShape: 'object',
        chargesShape: 'object',
      },
    );
    expect(JSON.stringify(workflowLog.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(workflowLog.mock.calls)).not.toContain(
      'authorization',
    );
  });
});
