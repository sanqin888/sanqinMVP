import type { UberTelemetryPort } from '../../application/shared/uber-telemetry.port';
import { UberOrderDetailGatewayAdapter } from './uber-order-detail.gateway';

describe('UberOrderDetailGatewayAdapter diagnostics', () => {
  it('records only field shapes when a successful order detail cannot be mapped', async () => {
    const workflowLog =
      jest.fn<Pick<UberTelemetryPort, 'workflowLog'>['workflowLog']>();
    const secret = 'Bearer super-secret-credential';
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
