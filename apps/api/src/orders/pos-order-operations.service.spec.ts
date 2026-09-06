import { PosOrderOperationsService } from './pos-order-operations.service';

describe('PosOrderOperationsService durable POS creation', () => {
  function setup() {
    const orders = {
      createForStore: jest.fn().mockResolvedValue({
        orderStableId: 'cposdurableorder00000000001',
        channel: 'in_store',
        status: 'paid',
      }),
      getByStableIdForStore: jest.fn(),
      updateStatusForStore: jest.fn(),
    };
    const scheduling = {
      findByStableIdForStore: jest.fn().mockResolvedValue({
        orderStableId: 'cposdurableorder00000000001',
        status: 'paid',
        fulfillmentTiming: 'IMMEDIATE',
      }),
    };
    const preparation = {
      acceptWebOrderByStableId: jest.fn().mockResolvedValue('IMMEDIATE'),
      activateAcceptedImmediateOrderByStableId: jest
        .fn()
        .mockResolvedValue({ outcome: 'activated' }),
      activateScheduledOrderByStableId: jest
        .fn()
        .mockResolvedValue({ outcome: 'activated' }),
    };
    const lifecycleOutbox = { requestDrain: jest.fn() };
    const labelPlan = { getByStableId: jest.fn().mockResolvedValue({ labels: [] }) };
    const service = new PosOrderOperationsService(
      orders as never,
      scheduling as never,
      preparation as never,
      lifecycleOutbox as never,
      labelPlan as never,
    );
    return {
      service,
      orders,
      scheduling,
      preparation,
      lifecycleOutbox,
      labelPlan,
    };
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

  it('records Web acceptance, materializes immediate prep, then wakes durable printing', async () => {
    const { service, preparation, lifecycleOutbox } = setup();

    await service.acceptWebOrder(
      'cwebdurableorder00000000001',
      '4750_Yonge_Street',
    );

    expect(preparation.acceptWebOrderByStableId).toHaveBeenCalledWith(
      'cwebdurableorder00000000001',
      '4750_Yonge_Street',
    );
    expect(
      preparation.activateAcceptedImmediateOrderByStableId,
    ).toHaveBeenCalledWith('cwebdurableorder00000000001', '4750_Yonge_Street');
    expect(lifecycleOutbox.requestDrain).toHaveBeenCalledTimes(1);
  });

  it('records scheduled Web acceptance without starting prep or waking AUTO printing early', async () => {
    const { service, preparation, lifecycleOutbox } = setup();
    preparation.acceptWebOrderByStableId.mockResolvedValueOnce('SCHEDULED');

    await service.acceptWebOrder(
      'cwebscheduledorder0000000001',
      '4750_Yonge_Street',
    );

    expect(
      preparation.activateAcceptedImmediateOrderByStableId,
    ).not.toHaveBeenCalled();
    expect(lifecycleOutbox.requestDrain).not.toHaveBeenCalled();
  });

  it('routes Web paid -> making status requests through durable acceptance instead of direct status mutation', async () => {
    const { service, orders, preparation } = setup();
    orders.getByStableIdForStore
      .mockResolvedValueOnce({
        orderStableId: 'cwebdurableorder00000000001',
        channel: 'web',
        status: 'paid',
      })
      .mockResolvedValueOnce({
        orderStableId: 'cwebdurableorder00000000001',
        channel: 'web',
        status: 'making',
      });

    await expect(
      service.updateStatusForStore(
        'cwebdurableorder00000000001',
        '4750_Yonge_Street',
        'making',
      ),
    ).resolves.toEqual(
      expect.objectContaining({ channel: 'web', status: 'making' }),
    );

    expect(preparation.acceptWebOrderByStableId).toHaveBeenCalledWith(
      'cwebdurableorder00000000001',
      '4750_Yonge_Street',
    );
    expect(orders.updateStatusForStore).not.toHaveBeenCalled();
  });

  it('routes Uber paid -> making status through durable IMMEDIATE preparation', async () => {
    const { service, orders, preparation, lifecycleOutbox } = setup();
    orders.getByStableIdForStore
      .mockResolvedValueOnce({
        orderStableId: 'cuberorder00000000000000001',
        channel: 'ubereats',
        status: 'paid',
      })
      .mockResolvedValueOnce({
        orderStableId: 'cuberorder00000000000000001',
        channel: 'ubereats',
        status: 'making',
      });

    await expect(
      service.updateStatusForStore(
        'cuberorder00000000000000001',
        '4750_Yonge_Street',
        'making',
      ),
    ).resolves.toEqual(
      expect.objectContaining({ channel: 'ubereats', status: 'making' }),
    );

    expect(
      preparation.activateAcceptedImmediateOrderByStableId,
    ).toHaveBeenCalledWith('cuberorder00000000000000001', '4750_Yonge_Street');
    expect(lifecycleOutbox.requestDrain).toHaveBeenCalledTimes(1);
    expect(orders.updateStatusForStore).not.toHaveBeenCalled();
  });

  it('routes Uber paid -> making status through durable SCHEDULED preparation', async () => {
    const { service, orders, scheduling, preparation, lifecycleOutbox } =
      setup();
    scheduling.findByStableIdForStore.mockResolvedValueOnce({
      orderStableId: 'cuberscheduled00000000000001',
      status: 'paid',
      fulfillmentTiming: 'SCHEDULED',
    });
    orders.getByStableIdForStore
      .mockResolvedValueOnce({
        orderStableId: 'cuberscheduled00000000000001',
        channel: 'ubereats',
        status: 'paid',
      })
      .mockResolvedValueOnce({
        orderStableId: 'cuberscheduled00000000000001',
        channel: 'ubereats',
        status: 'making',
      });

    await expect(
      service.updateStatusForStore(
        'cuberscheduled00000000000001',
        '4750_Yonge_Street',
        'making',
      ),
    ).resolves.toEqual(
      expect.objectContaining({ channel: 'ubereats', status: 'making' }),
    );

    expect(preparation.activateScheduledOrderByStableId).toHaveBeenCalledWith(
      'cuberscheduled00000000000001',
      '4750_Yonge_Street',
    );
    expect(
      preparation.activateAcceptedImmediateOrderByStableId,
    ).not.toHaveBeenCalled();
    expect(lifecycleOutbox.requestDrain).not.toHaveBeenCalled();
    expect(orders.updateStatusForStore).not.toHaveBeenCalled();
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
