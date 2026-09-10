import { OrderExternalFactsReaderService } from './order-external-facts-reader.service';

const at = (value: string) => new Date(value);

const setup = () => {
  const order = {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  };
  return {
    order,
    reader: new OrderExternalFactsReaderService({ order } as never),
  };
};

describe('OrderExternalFactsReaderService', () => {
  it('resolves external identity to stable canonical facts without exposing the DB UUID', async () => {
    const { order, reader } = setup();
    order.findFirst.mockResolvedValue({
      id: 'order-db-uuid-never-exported',
      orderStableId: 'stable-order-1',
      status: 'pending',
      totalCents: 1_130,
      createdAt: at('2026-09-10T12:00:00.000Z'),
      paidAt: at('2026-09-10T12:01:00.000Z'),
      fulfillmentTiming: 'SCHEDULED',
      externalEstimatedReadyAt: at('2026-09-10T12:30:00.000Z'),
    });

    await expect(
      reader.findByExternalIdentity({
        channel: 'ubereats',
        externalOrderId: 'uber-order-1',
      }),
    ).resolves.toEqual({
      orderStableId: 'stable-order-1',
      status: 'pending',
      totalCents: 1_130,
      createdAt: '2026-09-10T12:00:00.000Z',
      paidAt: '2026-09-10T12:01:00.000Z',
      fulfillmentTiming: 'SCHEDULED',
      externalEstimatedReadyAt: '2026-09-10T12:30:00.000Z',
    });
    expect(order.findFirst).toHaveBeenCalledWith({
      where: {
        channel: 'ubereats',
        clientRequestId: 'ubereats:uber-order-1',
      },
      select: {
        orderStableId: true,
        status: true,
        totalCents: true,
        createdAt: true,
        paidAt: true,
        fulfillmentTiming: true,
        externalEstimatedReadyAt: true,
      },
    });
  });

  it('returns null and false when the canonical external identity is absent', async () => {
    const { order, reader } = setup();
    order.findFirst.mockResolvedValue(null);

    await expect(
      reader.findByExternalIdentity({
        channel: 'ubereats',
        externalOrderId: 'missing-order',
      }),
    ).resolves.toBeNull();
    await expect(
      reader.existsByExternalIdentity({
        channel: 'ubereats',
        externalOrderId: 'missing-order',
      }),
    ).resolves.toBe(false);
    expect(order.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        channel: 'ubereats',
        clientRequestId: 'ubereats:missing-order',
      },
      select: { orderStableId: true },
    });
  });

  it('reads scheduled timing only by stable business identity', async () => {
    const { order, reader } = setup();
    order.findUnique.mockResolvedValue({
      orderStableId: 'stable-order-1',
      scheduledReadyAt: at('2026-09-10T12:30:00.000Z'),
      prepStartAt: at('2026-09-10T12:15:00.000Z'),
      prepDurationMinutes: 15,
    });

    await expect(
      reader.findSchedulingByOrderStableId('stable-order-1'),
    ).resolves.toEqual({
      orderStableId: 'stable-order-1',
      scheduledReadyAt: '2026-09-10T12:30:00.000Z',
      prepStartAt: '2026-09-10T12:15:00.000Z',
      prepDurationMinutes: 15,
    });
    expect(order.findUnique).toHaveBeenCalledWith({
      where: { orderStableId: 'stable-order-1' },
      select: {
        orderStableId: true,
        scheduledReadyAt: true,
        prepStartAt: true,
        prepDurationMinutes: true,
      },
    });
  });

  it('preserves pending list identity, ordering and summary semantics', async () => {
    const { order, reader } = setup();
    order.findMany.mockResolvedValue([
      {
        orderStableId: 'stable-order-1',
        clientRequestId: 'ubereats:uber-order-1',
        pickupCode: '42',
        status: 'making',
        totalCents: 1_130,
        createdAt: at('2026-09-10T12:00:00.000Z'),
      },
    ]);
    order.count.mockResolvedValue(1);
    order.findFirst.mockResolvedValue({
      createdAt: at('2026-09-10T12:00:00.000Z'),
    });
    const input = {
      channel: 'ubereats' as const,
      statuses: ['pending', 'paid', 'making'] as const,
    };

    await expect(
      reader.listByChannelAndStatuses({ ...input, limit: 100 }),
    ).resolves.toEqual([
      {
        orderStableId: 'stable-order-1',
        externalOrderId: 'uber-order-1',
        pickupCode: '42',
        status: 'making',
        totalCents: 1_130,
        createdAt: '2026-09-10T12:00:00.000Z',
      },
    ]);
    await expect(
      reader.summarizeByChannelAndStatuses(input),
    ).resolves.toEqual({
      count: 1,
      latestCreatedAt: '2026-09-10T12:00:00.000Z',
    });
    expect(order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          channel: 'ubereats',
          status: { in: ['pending', 'paid', 'making'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  });

  it('preserves reconciliation store scope and half-open time range', async () => {
    const { order, reader } = setup();
    order.findMany.mockResolvedValue([{ status: 'paid', totalCents: 1_130 }]);

    await expect(
      reader.listReconciliationFacts({
        channel: 'ubereats',
        storeStableId: '4750_Yonge_Street',
        createdAtFrom: '2026-09-10T00:00:00.000Z',
        createdAtBefore: '2026-09-11T00:00:00.000Z',
      }),
    ).resolves.toEqual([{ status: 'paid', totalCents: 1_130 }]);
    expect(order.findMany).toHaveBeenCalledWith({
      where: {
        channel: 'ubereats',
        storeId: '4750_Yonge_Street',
        createdAt: {
          gte: at('2026-09-10T00:00:00.000Z'),
          lt: at('2026-09-11T00:00:00.000Z'),
        },
      },
      select: { status: true, totalCents: true },
    });
  });
});
