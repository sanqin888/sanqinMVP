import { OrderSchedulingQueryService } from './order-scheduling-query.service';

describe('OrderSchedulingQueryService scheduled queue', () => {
  it('queries scheduled Orders directly by the authenticated store stable ID', async () => {
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
      order: { findMany: orderFindMany },
    } as never);

    await expect(
      service.listUpcomingForStoreStableId('4750_Yonge_Street'),
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

  it('returns fulfillment timing for board orders after scheduled activation', async () => {
    const orderFindMany = jest.fn().mockResolvedValue([
      { orderStableId: 'scheduled-1', fulfillmentTiming: 'SCHEDULED' },
      { orderStableId: 'immediate-1', fulfillmentTiming: 'IMMEDIATE' },
    ]);
    const service = new OrderSchedulingQueryService({
      order: { findMany: orderFindMany },
    } as never);

    const result = await service.findTimingsByStableIdsForStore(
      ['scheduled-1', 'immediate-1', 'scheduled-1'],
      '4750_Yonge_Street',
    );

    expect(result).toEqual(
      new Map([
        ['scheduled-1', 'SCHEDULED'],
        ['immediate-1', 'IMMEDIATE'],
      ]),
    );
    expect(orderFindMany).toHaveBeenCalledWith({
      where: {
        orderStableId: { in: ['scheduled-1', 'immediate-1'] },
        OR: [{ storeId: '4750_Yonge_Street' }, { storeId: null }],
      },
      select: { orderStableId: true, fulfillmentTiming: true },
    });
  });
});
