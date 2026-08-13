import {
  UberOrderActionGatewayAdapter,
  UberOrderCommandError,
} from './uber-order-action.gateway';

describe('UberOrderActionGatewayAdapter', () => {
  it('owns the DENY reason wire payload', async () => {
    const executeAction = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, data: {} });
    const gateway = new UberOrderActionGatewayAdapter({
      executeAction,
    } as never);
    await gateway.deny({
      externalOrderId: 'order/1',
      idempotencyKey: 'key',
      denial: { reasonCode: 'ITEM_UNAVAILABLE', reasonDetail: 'sold out' },
    });
    expect(executeAction).toHaveBeenCalledWith(
      'order/1',
      'DENY',
      {
        reason: { code: 'ITEM_AVAILABILITY', explanation: 'sold out' },
      },
      'key',
    );
  });

  it('treats a ready conflict as idempotent success', async () => {
    const executeAction = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 409, data: {} });
    await expect(
      new UberOrderActionGatewayAdapter({
        executeAction,
      } as never).readyForPickup({
        externalOrderId: 'order-1',
        idempotencyKey: 'key',
      }),
    ).resolves.toBeUndefined();
  });

  it('maps CANCEL to the merchant denial endpoint', async () => {
    const executeAction = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, data: {} });
    await new UberOrderActionGatewayAdapter({ executeAction } as never).cancel({
      externalOrderId: 'order-1',
      idempotencyKey: 'cancel-key',
    });
    expect(executeAction).toHaveBeenCalledWith(
      'order-1',
      'DENY',
      { reason: { code: 'OTHER', explanation: 'Cancelled by merchant' } },
      'cancel-key',
    );
  });

  it('exposes only stable upstream facts for an HTTP failure', async () => {
    const executeAction = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      data: { message: 'unsafe upstream detail' },
      retryAfter: '3',
    });

    const error = await new UberOrderActionGatewayAdapter({
      executeAction,
    } as never)
      .accept({ externalOrderId: 'order-1', idempotencyKey: 'key' })
      .catch((caught: unknown) => caught as UberOrderCommandError);

    expect(error).toMatchObject({
      status: 429,
      code: 'UBER_ORDER_HTTP_429',
      retryAfterMs: 3_000,
      message: 'Uber order command failed with HTTP 429',
    });
    expect(error).not.toHaveProperty('retryable');
    expect(error.message).not.toContain('unsafe upstream detail');
  });

  it('normalizes an unknown transport failure as no HTTP response', async () => {
    const executeAction = jest.fn().mockRejectedValue(new Error('secret'));

    await expect(
      new UberOrderActionGatewayAdapter({ executeAction } as never).accept({
        externalOrderId: 'order-1',
        idempotencyKey: 'key',
      }),
    ).rejects.toMatchObject({
      status: null,
      message: 'Uber order command failed before receiving an HTTP response',
    });
  });
});
