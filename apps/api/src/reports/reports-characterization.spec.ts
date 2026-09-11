import { OrderStatus } from '@prisma/client';
import { ReportsService } from './reports.service';

describe('ReportsService KPI and business-day characterization', () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('follows process.env.TZ for report-day boundaries before any later StoreConfig normalization', async () => {
    process.env.TZ = 'America/Vancouver';
    const aggregate = jest.fn().mockResolvedValue({
      _sum: {
        totalCents: 0,
        subtotalCents: 0,
        taxCents: 0,
        deliveryFeeCents: 0,
      },
      _count: { id: 0 },
    });
    const groupBy = jest.fn().mockResolvedValue([]);
    const rawOrderFindMany = jest.fn().mockResolvedValue([]);
    const orderItemFindMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      order: {
        aggregate,
        groupBy,
        findMany: rawOrderFindMany,
      },
      orderItem: { findMany: orderItemFindMany },
    };
    const service = new ReportsService(prisma as never);

    await service.getReport({ from: '2026-09-02', to: '2026-09-02' });

    expect(aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          createdAt: {
            gte: new Date('2026-09-02T07:00:00.000Z'),
            lte: new Date('2026-09-03T06:59:59.999Z'),
          },
          status: {
            in: [
              OrderStatus.paid,
              OrderStatus.making,
              OrderStatus.ready,
              OrderStatus.completed,
            ],
          },
        },
      }),
    );
  });

  it('uses the configured process timezone for order-day bounds and preserves current Order total KPI semantics', async () => {
    process.env.TZ = 'America/Toronto';
    const aggregate = jest.fn().mockResolvedValue({
      _sum: {
        totalCents: 2653,
        subtotalCents: 2300,
        taxCents: 299,
        deliveryFeeCents: 54,
      },
      _count: { id: 2 },
    });
    const groupBy = jest
      .fn()
      .mockResolvedValueOnce([
        {
          paymentMethod: 'CASH',
          _sum: { totalCents: 2146 },
          _count: { id: 1 },
        },
        {
          paymentMethod: 'CARD',
          _sum: { totalCents: 507 },
          _count: { id: 1 },
        },
      ])
      .mockResolvedValueOnce([
        {
          fulfillmentType: 'DINE_IN',
          _sum: { totalCents: 2653 },
          _count: { id: 2 },
        },
      ]);
    const rawOrderFindMany = jest.fn().mockResolvedValue([
      {
        createdAt: new Date('2026-09-02T04:30:00.000Z'),
        totalCents: 2146,
      },
      {
        createdAt: new Date('2026-09-02T15:00:00.000Z'),
        totalCents: 507,
      },
    ]);
    const orderItemFindMany = jest.fn().mockResolvedValue([
      {
        qty: 3,
        productStableId: 'item_noodle',
        displayName: 'Noodle',
        nameEn: 'Noodle',
        nameZh: '面',
        componentsJson: null,
      },
    ]);
    const prisma = {
      order: {
        aggregate,
        groupBy,
        findMany: rawOrderFindMany,
      },
      orderItem: {
        findMany: orderItemFindMany,
      },
    };
    const service = new ReportsService(prisma as never);

    await expect(
      service.getReport({ from: '2026-09-02', to: '2026-09-02' }),
    ).resolves.toEqual({
      summary: {
        totalSales: 26.53,
        subtotal: 23,
        tax: 2.99,
        deliveryFees: 0.54,
        orderCount: 2,
        averageOrderValue: 13.27,
      },
      chartData: [
        { date: '00:00', total: 21.46 },
        { date: '11:00', total: 5.07 },
      ],
      breakdown: {
        payment: [
          { name: 'CASH', value: 21.46 },
          { name: 'CARD', value: 5.07 },
        ],
        fulfillment: [{ name: 'DINE_IN', value: 26.53 }],
      },
      topItems: [{ name: 'Noodle', quantity: 3 }],
    });

    const where = {
      createdAt: {
        gte: new Date('2026-09-02T04:00:00.000Z'),
        lte: new Date('2026-09-03T03:59:59.999Z'),
      },
      status: {
        in: [
          OrderStatus.paid,
          OrderStatus.making,
          OrderStatus.ready,
          OrderStatus.completed,
        ],
      },
    };
    expect(aggregate).toHaveBeenCalledWith({
      where,
      _sum: {
        totalCents: true,
        subtotalCents: true,
        taxCents: true,
        deliveryFeeCents: true,
      },
      _count: { id: true },
    });
    expect(groupBy).toHaveBeenNthCalledWith(1, {
      by: ['paymentMethod'],
      where,
      _sum: { totalCents: true },
      _count: { id: true },
    });
    expect(groupBy).toHaveBeenNthCalledWith(2, {
      by: ['fulfillmentType'],
      where,
      _sum: { totalCents: true },
      _count: { id: true },
    });
    expect(rawOrderFindMany).toHaveBeenCalledWith({
      where,
      select: { createdAt: true, totalCents: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(orderItemFindMany).toHaveBeenCalledWith({
      where: {
        order: where,
      },
      select: {
        qty: true,
        productStableId: true,
        displayName: true,
        nameEn: true,
        nameZh: true,
        componentsJson: true,
      },
    });
  });
});
