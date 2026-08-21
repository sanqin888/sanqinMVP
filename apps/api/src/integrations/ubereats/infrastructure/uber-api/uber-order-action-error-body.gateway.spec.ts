import {
  UberOrderActionGatewayAdapter,
  UberOrderCommandError,
} from './uber-order-action.gateway';

describe('Uber order action error body diagnostics', () => {
  it('attaches a bounded redacted response body to non-idempotent failures', async () => {
    const sendActionCommand = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      data: {
        code: 'bad_request',
        message: 'contact test@example.com bearer secret-token',
        metadata: {
          should_retry: false,
          access_token: 'must-not-leak',
        },
      },
      retryAfter: null,
    });

    const error = await new UberOrderActionGatewayAdapter({
      sendActionCommand,
    } as never)
      .readyForPickup({
        externalOrderId: 'order-1',
        idempotencyKey: 'ready-key',
      })
      .catch((caught: unknown) => caught as UberOrderCommandError);

    expect(error).toMatchObject({
      status: 400,
      code: 'UBER_ORDER_HTTP_400',
      responseBody: {
        code: 'bad_request',
        metadata: {
          should_retry: false,
          access_token: '[REDACTED]',
        },
      },
    });
    expect(JSON.stringify(error.responseBody)).not.toContain('test@example.com');
    expect(JSON.stringify(error.responseBody)).not.toContain('must-not-leak');
  });
});