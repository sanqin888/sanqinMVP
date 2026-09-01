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
  const posRequest = {
    posDevice: {
      deviceStableId: 'device-1',
      storeStableId: '4750_Yonge_Street',
      name: 'Front POS',
    },
  } as never;

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
      listUpcomingForStoreStableId: jest
        .fn()
        .mockResolvedValue(scheduledOrders),
    };
    const controller = new ScheduledOrdersController(
      query as never,
      {} as never,
    );

    await expect(
      controller.listScheduledOrders({
        posDevice: {
          deviceStableId: 'device-1',
          storeStableId: '4750_Yonge_Street',
          name: 'Front POS',
        },
      } as never),
    ).resolves.toEqual({ orders: scheduledOrders });
    expect(query.listUpcomingForStoreStableId).toHaveBeenCalledWith(
      '4750_Yonge_Street',
    );
  });

  it('rejects a queue read when the POS device store context is unavailable', async () => {
    const controller = new ScheduledOrdersController(
      { listUpcomingForStoreStableId: jest.fn() } as never,
      {} as never,
    );

    await expect(controller.listScheduledOrders({} as never)).rejects.toThrow(
      'POS device store unavailable',
    );
  });

  it('manual early start delegates to the same scheduled activation command', async () => {
    const query = {
      findByStableIdForStore: jest
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

    await expect(
      controller.startPreparationEarly(posRequest, 'stable-1'),
    ).resolves.toEqual(expect.objectContaining({ status: 'making' }));
    expect(query.findByStableIdForStore).toHaveBeenCalledWith(
      'stable-1',
      '4750_Yonge_Street',
    );
    expect(preparation.activateScheduledOrderByStableId).toHaveBeenCalledWith(
      'stable-1',
      '4750_Yonge_Street',
    );
  });

  it('rejects early-start for an immediate order', async () => {
    const controller = new ScheduledOrdersController(
      {
        findByStableIdForStore: jest
          .fn()
          .mockResolvedValue(timing('IMMEDIATE')),
      } as never,
      { activateScheduledOrderByStableId: jest.fn() } as never,
    );
    await expect(
      controller.startPreparationEarly(posRequest, 'stable-1'),
    ).rejects.toThrow('order is not scheduled');
  });
});
