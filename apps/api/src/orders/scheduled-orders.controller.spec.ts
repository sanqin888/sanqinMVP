import { ScheduledOrdersController } from './scheduled-orders.controller';

const timing = (
  fulfillmentTiming: 'IMMEDIATE' | 'SCHEDULED' = 'SCHEDULED',
) => ({
  orderStableId: 'stable-1',
  status: 'paid',
  fulfillmentTiming,
  scheduledReadyAt: '2026-08-19T22:30:00.000Z',
  prepStartAt: '2026-08-19T22:10:00.000Z',
  prepDurationMinutes: 20,
  scheduleActivatedAt: null,
  externalEstimatedReadyAt: null,
});

describe('ScheduledOrdersController', () => {
  it('lists scheduled orders only for the authenticated POS device store', async () => {
    const scheduledOrders = [
      {
        orderStableId: 'stable-1',
        orderNumber: 'A1234',
        channel: 'ubereats',
        productionStartAt: '2026-08-19T22:10:00.000Z',
        scheduledFor: '2026-08-19T22:30:00.000Z',
        itemCount: 2,
      },
    ];
    const query = {
      listUpcomingForDeviceStore: jest.fn().mockResolvedValue(scheduledOrders),
    };
    const controller = new ScheduledOrdersController(
      query as never,
      {} as never,
    );

    await expect(
      controller.listScheduledOrders({
        posDevice: { storeId: 'store-uuid-1' },
      } as never),
    ).resolves.toEqual({ orders: scheduledOrders });
    expect(query.listUpcomingForDeviceStore).toHaveBeenCalledWith(
      'store-uuid-1',
    );
  });

  it('rejects a queue read when the POS device store context is unavailable', async () => {
    const controller = new ScheduledOrdersController(
      { listUpcomingForDeviceStore: jest.fn() } as never,
      {} as never,
    );

    await expect(controller.listScheduledOrders({} as never)).rejects.toThrow(
      'POS device store unavailable',
    );
  });

  it('manual early start delegates to the same scheduled activation command', async () => {
    const query = {
      findByStableId: jest
        .fn()
        .mockResolvedValueOnce(timing())
        .mockResolvedValueOnce({
          ...timing(),
          status: 'making',
          scheduleActivatedAt: '2026-08-19T22:05:00.000Z',
        }),
    };
    const preparation = {
      activateScheduledOrderByStableId: jest.fn().mockResolvedValue({
        outcome: 'activated',
      }),
    };
    const controller = new ScheduledOrdersController(
      query as never,
      preparation as never,
    );

    await expect(controller.startPreparationEarly('stable-1')).resolves.toEqual(
      expect.objectContaining({ status: 'making' }),
    );
    expect(preparation.activateScheduledOrderByStableId).toHaveBeenCalledWith(
      'stable-1',
    );
  });

  it('rejects early-start for an immediate order', async () => {
    const controller = new ScheduledOrdersController(
      {
        findByStableId: jest.fn().mockResolvedValue(timing('IMMEDIATE')),
      } as never,
      { activateScheduledOrderByStableId: jest.fn() } as never,
    );
    await expect(controller.startPreparationEarly('stable-1')).rejects.toThrow(
      'order is not scheduled',
    );
  });
});
