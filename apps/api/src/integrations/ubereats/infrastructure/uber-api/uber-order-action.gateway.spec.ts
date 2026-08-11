import { UberOrderActionGatewayAdapter } from './uber-order-action.gateway';

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
});
