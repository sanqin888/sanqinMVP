import { PosOrderOperationsService } from './pos-order-operations.service';

describe('PosOrderOperationsService durable POS creation', () => {
  function setup() {
    const orders = {
      createForStore: jest.fn().mockResolvedValue({
        orderStableId: 'cposdurableorder00000000001',
        channel: 'in_store',
        status: 'paid',
      }),
    };
    const preparation = {
      activateAcceptedImmediateOrderByStableId: jest
        .fn()
        .mockResolvedValue({ outcome: 'activated' }),
    };
    const lifecycleOutbox = { requestDrain: jest.fn() };
    const service = new PosOrderOperationsService(
      orders as never,
      {} as never,
      preparation as never,
      lifecycleOutbox as never,
    );
    return { service, orders, preparation, lifecycleOutbox };
  }

  it('wakes the durable lifecycle consumer after an in-store order has committed', async () => {
    const { service, orders, lifecycleOutbox } = setup();
    const input = {
      channel: 'in_store' as const,
      fulfillmentType: 'pickup' as const,
      paymentMethod: 'CASH' as const,
      items: [],
    };

    await expect(
      service.createForStore(input, '4750_Yonge_Street'),
    ).resolves.toEqual(
      expect.objectContaining({ orderStableId: 'cposdurableorder00000000001' }),
    );

    expect(orders.createForStore).toHaveBeenCalledWith(
      input,
      '4750_Yonge_Street',
    );
    expect(lifecycleOutbox.requestDrain).toHaveBeenCalledTimes(1);
    expect(orders.createForStore.mock.invocationCallOrder[0]).toBeLessThan(
      lifecycleOutbox.requestDrain.mock.invocationCallOrder[0],
    );
  });

  it('routes a paid in-store manual advance through the same durable preparation path', async () => {
    const { service, preparation, lifecycleOutbox } = setup();

    await service.activateImmediatePreparation(
      'cposdurableorder00000000001',
      '4750_Yonge_Street',
    );

    expect(
      preparation.activateAcceptedImmediateOrderByStableId,
    ).toHaveBeenCalledWith('cposdurableorder00000000001', '4750_Yonge_Street');
    expect(lifecycleOutbox.requestDrain).toHaveBeenCalledTimes(1);
  });

  it('does not synthesize local acceptance for an Uber channel order', async () => {
    const { service, lifecycleOutbox } = setup();

    await service.createForStore(
      {
        channel: 'ubereats',
        fulfillmentType: 'pickup',
        paymentMethod: 'UBEREATS',
        items: [],
      },
      '4750_Yonge_Street',
    );

    expect(lifecycleOutbox.requestDrain).not.toHaveBeenCalled();
  });
});
