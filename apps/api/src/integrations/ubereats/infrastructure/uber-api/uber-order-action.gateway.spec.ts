import {
  UberOrderActionGatewayAdapter,
  UberOrderCommandError,
} from './uber-order-action.gateway';

describe('UberOrderActionGatewayAdapter Order Fulfillment 1.0.0', () => {
  it('sends absolute ready_for_pickup_time on ACCEPT', async () => {
    const sendActionCommand = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, data: {} });
    const adapter = new UberOrderActionGatewayAdapter({
      sendActionCommand,
    } as never);

    await adapter.accept({
      externalOrderId: 'order/1',
      idempotencyKey: 'accept-key',
      readyForPickupAt: new Date('2026-08-20T13:30:00.000Z'),
    });

    expect(sendActionCommand).toHaveBeenCalledWith(
      'order/1',
      'ACCEPT',
      { ready_for_pickup_time: '2026-08-20T13:30:00.000Z' },
      'accept-key',
    );
  });

  it('maps admission reason into the v1 DENY reason object', async () => {
    const sendActionCommand = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, data: {} });
    const adapter = new UberOrderActionGatewayAdapter({
      sendActionCommand,
    } as never);

    await adapter.deny({
      externalOrderId: 'order/1',
      idempotencyKey: 'deny-key',
      denial: { reasonCode: 'ITEM_UNAVAILABLE', reasonDetail: 'sold out' },
    });

    expect(sendActionCommand).toHaveBeenCalledWith(
      'order/1',
      'DENY',
      {
        deny_reason: {
          type: 'ITEM_ISSUE',
          info: 'sold out',
          client_error_code: 'ITEM_UNAVAILABLE',
        },
      },
      'deny-key',
    );
  });

  it('uses the dedicated v1 CANCEL command and cancellation_reason', async () => {
    const sendActionCommand = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 204, data: {} });
    const adapter = new UberOrderActionGatewayAdapter({
      sendActionCommand,
    } as never);

    await adapter.cancel({
      externalOrderId: 'order-1',
      idempotencyKey: 'cancel-key',
      denial: { reasonCode: 'STORE_CLOSED', reasonDetail: 'closed' },
    });

    expect(sendActionCommand).toHaveBeenCalledWith(
      'order-1',
      'CANCEL',
      {
        cancellation_reason: {
          type: 'STORE_CLOSED',
          info: 'closed',
          client_error_code: 'STORE_CLOSED',
        },
      },
      'cancel-key',
    );
  });

  it('sends an empty body when marking READY', async () => {
    const sendActionCommand = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, data: {} });
    const adapter = new UberOrderActionGatewayAdapter({
      sendActionCommand,
    } as never);
    await adapter.readyForPickup({
      externalOrderId: 'order-1',
      idempotencyKey: 'ready-key',
    });
    expect(sendActionCommand).toHaveBeenCalledWith(
      'order-1',
      'READY_FOR_PICKUP',
      {},
      'ready-key',
    );
  });

  it.each([
    ['ACCEPT', 409],
    ['DENY', 409],
    ['CANCEL', 404],
    ['READY_FOR_PICKUP', 409],
  ] as const)('treats repeated %s terminal response as idempotent', async (action, status) => {
    const sendActionCommand = jest
      .fn()
      .mockResolvedValue({ ok: false, status, data: {} });
    const adapter = new UberOrderActionGatewayAdapter({
      sendActionCommand,
    } as never);
    const common = { externalOrderId: 'order-1', idempotencyKey: 'key' };
    if (action === 'ACCEPT')
      await expect(
        adapter.accept({
          ...common,
          readyForPickupAt: new Date('2026-08-20T13:30:00.000Z'),
        }),
      ).resolves.toBeUndefined();
    else if (action === 'DENY')
      await expect(
        adapter.deny({ ...common, denial: { reasonCode: 'OTHER', reasonDetail: null } }),
      ).resolves.toBeUndefined();
    else if (action === 'CANCEL')
      await expect(adapter.cancel(common)).resolves.toBeUndefined();
    else await expect(adapter.readyForPickup(common)).resolves.toBeUndefined();
  });

  it('exposes only stable upstream facts for an HTTP failure', async () => {
    const sendActionCommand = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      data: { message: 'unsafe upstream detail' },
      retryAfter: '3',
    });
    const error = await new UberOrderActionGatewayAdapter({
      sendActionCommand,
    } as never)
      .accept({
        externalOrderId: 'order-1',
        idempotencyKey: 'key',
        readyForPickupAt: new Date('2026-08-20T13:30:00.000Z'),
      })
      .catch((caught: unknown) => caught as UberOrderCommandError);

    expect(error).toMatchObject({
      status: 429,
      code: 'UBER_ORDER_HTTP_429',
      retryAfterMs: 3_000,
      message: 'Uber order command failed with HTTP 429',
    });
    expect(error.message).not.toContain('unsafe upstream detail');
  });
});
