import { OrderSchedulingQueryService } from './order-scheduling-query.service';

describe('OrderSchedulingQueryService scheduled queue', () => {
  it('resolves the POS device Store UUID before querying Order.storeId', async () => {
    const storeFindUnique = jest.fn().mockResolvedValue({
      storeStableId: '4750_Yonge_Street',
    });
    const orderFindMany = jest.fn().mockResolvedValue([
      {
        orderStableId: 'stable-1',
        clientRequestId: null,
        externalDisplayId: 'A1234',
        channel: 'ubereats',
        prepStartAt: new Date('2026-08-20T15:10:00.000Z'),
        scheduledReadyAt: new Date('2026-08-20T15:30:00.000Z'),
        items: [{ qty: 2 }, { qty: 1 }],
      },
    ]);
    const service = new OrderSchedulingQueryService({
      store: { findUnique: storeFindUnique },
      order: { findMany: orderFindMany },
    } as never);

    await expect(
      service.listUpcomingForDeviceStore(
        '8a3d4c0e-4750-4f6a-9138-000000000001',
      ),
    ).resolves.toEqual([
      {
        orderStableId: 'stable-1',
        orderNumber: 'A1234',
        channel: 'ubereats',
        productionStartAt: '2026-08-20T15:10:00.000Z',
        scheduledFor: '2026-08-20T15:30:00.000Z',
        itemCount: 3,
      },
    ]);

    expect(storeFindUnique).toHaveBeenCalledWith({
      where: { id: '8a3d4c0e-4750-4f6a-9138-000000000001' },
      select: { storeStableId: true },
    });
    expect(orderFindMany).toHaveBeenCalledWith({
      where: {
        storeId: '4750_Yonge_Street',
        fulfillmentTiming: 'SCHEDULED',
        scheduleActivatedAt: null,
        status: { in: ['pending', 'paid'] },
        prepStartAt: { not: null },
        scheduledReadyAt: { not: null },
      },
      select: {
        orderStableId: true,
        clientRequestId: true,
        externalDisplayId: true,
        channel: true,
        prepStartAt: true,
        scheduledReadyAt: true,
        items: { select: { qty: true } },
      },
      orderBy: [{ prepStartAt: 'asc' }, { createdAt: 'asc' }],
      take: 100,
    });
  });

  it('returns an empty queue when the authenticated device store no longer exists', async () => {
    const orderFindMany = jest.fn();
    const service = new OrderSchedulingQueryService({
      store: { findUnique: jest.fn().mockResolvedValue(null) },
      order: { findMany: orderFindMany },
    } as never);

    await expect(
      service.listUpcomingForDeviceStore('missing-store-id'),
    ).resolves.toEqual([]);
    expect(orderFindMany).not.toHaveBeenCalled();
  });
});
