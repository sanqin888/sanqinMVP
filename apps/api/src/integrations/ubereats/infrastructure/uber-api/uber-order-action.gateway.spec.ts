<<<<<<< HEAD
import {
  UberOrderActionGatewayAdapter,
  UberOrderCommandError,
} from './uber-order-action.gateway';

describe('UberOrderActionGatewayAdapter', () => {
  it.each([
    ['accept', 'ACCEPT'],
    ['readyForPickup', 'READY_FOR_PICKUP'],
  ] as const)(
    '%s maps to the semantic endpoint with an empty payload and idempotency key',
    async (method, wireAction) => {
      const sendActionCommand = jest
        .fn()
        .mockResolvedValue({ ok: true, status: 200, data: {} });
      const adapter = new UberOrderActionGatewayAdapter({
        sendActionCommand,
      } as never);
      await adapter[method]({
        externalOrderId: 'order/1',
        idempotencyKey: `${method}-key`,
      });
      expect(sendActionCommand).toHaveBeenCalledWith(
        'order/1',
        wireAction,
        {},
        `${method}-key`,
      );
    },
  );

  it('owns the DENY reason wire payload', async () => {
    const sendActionCommand = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, data: {} });
    const gateway = new UberOrderActionGatewayAdapter({
      sendActionCommand,
=======
import { UberOrderActionGatewayAdapter } from './uber-order-action.gateway';

describe('UberOrderActionGatewayAdapter', () => {
  it('owns the DENY reason wire payload', async () => {
    const executeAction = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, data: {} });
    const gateway = new UberOrderActionGatewayAdapter({
      executeAction,
>>>>>>> origin/main
    } as never);
    await gateway.deny({
      externalOrderId: 'order/1',
      idempotencyKey: 'key',
      denial: { reasonCode: 'ITEM_UNAVAILABLE', reasonDetail: 'sold out' },
    });
<<<<<<< HEAD
    expect(sendActionCommand).toHaveBeenCalledWith(
=======
    expect(executeAction).toHaveBeenCalledWith(
>>>>>>> origin/main
      'order/1',
      'DENY',
      {
        reason: { code: 'ITEM_AVAILABILITY', explanation: 'sold out' },
      },
      'key',
    );
  });

<<<<<<< HEAD
  it.each([
    ['accept', undefined],
    ['deny', { denial: { reasonCode: 'STORE_CLOSED', reasonDetail: null } }],
    ['cancel', { denial: { reasonCode: 'STORE_CLOSED', reasonDetail: null } }],
    ['readyForPickup', undefined],
  ] as const)(
    'treats a repeated %s conflict as idempotent success',
    async (method, extra) => {
      const sendActionCommand = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 409, data: {} });
      const adapter = new UberOrderActionGatewayAdapter({
        sendActionCommand,
      } as never);
      await expect(
        adapter[method]({
          externalOrderId: 'order-1',
          idempotencyKey: 'key',
          ...extra,
        }),
      ).resolves.toBeUndefined();
    },
  );

  it('does not hide non-conflict upstream failures as idempotent success', async () => {
    const sendActionCommand = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 422, data: {} });

    await expect(
      new UberOrderActionGatewayAdapter({ sendActionCommand } as never).deny({
        externalOrderId: 'order-1',
        idempotencyKey: 'key',
        denial: { reasonCode: 'OTHER', reasonDetail: null },
      }),
    ).rejects.toMatchObject({ status: 422, code: 'UBER_ORDER_HTTP_422' });
  });

  it('maps CANCEL to the merchant denial endpoint', async () => {
    const sendActionCommand = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, data: {} });
    await new UberOrderActionGatewayAdapter({
      sendActionCommand,
    } as never).cancel({
      externalOrderId: 'order-1',
      idempotencyKey: 'cancel-key',
      denial: { reasonCode: 'ITEM_UNAVAILABLE', reasonDetail: 'sold out' },
    });
    expect(sendActionCommand).toHaveBeenCalledWith(
      'order-1',
      'DENY',
      { reason: { code: 'ITEM_AVAILABILITY', explanation: 'sold out' } },
      'cancel-key',
    );
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

  it.each([400, 429, 503])(
    'exposes HTTP %s without assigning service retry policy',
    async (status) => {
      const sendActionCommand = jest.fn().mockResolvedValue({
        ok: false,
        status,
        data: {},
      });
      const error = await new UberOrderActionGatewayAdapter({
        sendActionCommand,
      } as never)
        .accept({ externalOrderId: 'order-1', idempotencyKey: 'write-key' })
        .catch((caught: unknown) => caught as UberOrderCommandError);
      expect(error).toMatchObject({ status });
      expect(error).not.toHaveProperty('retryable');
      expect(sendActionCommand).toHaveBeenCalledWith(
        'order-1',
        'ACCEPT',
        {},
        'write-key',
      );
    },
  );

  it('normalizes an unknown transport failure as no HTTP response', async () => {
    const sendActionCommand = jest.fn().mockRejectedValue(new Error('secret'));

    await expect(
      new UberOrderActionGatewayAdapter({ sendActionCommand } as never).accept({
        externalOrderId: 'order-1',
        idempotencyKey: 'key',
      }),
    ).rejects.toMatchObject({
      status: null,
      message: 'Uber order command failed before receiving an HTTP response',
    });
=======
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
>>>>>>> origin/main
  });
});
