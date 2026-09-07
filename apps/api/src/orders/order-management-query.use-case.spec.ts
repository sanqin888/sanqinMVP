import { OrderManagementQueryUseCase } from './order-management-query.use-case';
import type { PrismaService } from './orders-prisma';

describe('OrderManagementQueryUseCase', () => {
  const findMany = jest.fn();
  const count = jest.fn();
  const prisma = {
    order: { findMany, count },
  } as unknown as PrismaService;
  const useCase = new OrderManagementQueryUseCase(prisma);

  beforeEach(() => {
    findMany.mockReset();
    count.mockReset();
  });

  it('scopes recent POS orders to the requested canonical storeStableId', async () => {
    findMany.mockResolvedValue([]);

    await expect(useCase.recent('second-store', 10)).resolves.toEqual([]);

    expect(findMany).toHaveBeenCalledWith({
      where: { storeId: 'second-store' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { items: true },
    });
  });

  it('preserves management filters and pagination', async () => {
    count.mockResolvedValue(73);
    findMany.mockResolvedValue([]);
    const createdAtGte = new Date('2026-09-03T04:00:00.000Z');
    const createdAtLt = new Date('2026-09-04T04:00:00.000Z');

    await expect(
      useCase.searchForStore('4750_Yonge_Street', {
        statusIn: ['paid', 'completed'],
        channelIn: ['web', 'in_store'],
        fulfillmentIn: ['pickup', 'dine_in'],
        createdAtGte,
        createdAtLt,
        minTotalCents: 5000,
        page: 2,
        pageSize: 50,
      }),
    ).resolves.toEqual({
      orders: [],
      page: 2,
      pageSize: 50,
      total: 73,
      totalPages: 2,
    });

    const expectedWhere = {
      storeId: '4750_Yonge_Street',
      status: { in: ['paid', 'completed'] },
      channel: { in: ['web', 'in_store'] },
      fulfillmentType: { in: ['pickup', 'dine_in'] },
      totalCents: { gte: 5000 },
      createdAt: { gte: createdAtGte, lt: createdAtLt },
    };
    expect(count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(findMany).toHaveBeenCalledWith({
      where: expectedWhere,
      orderBy: [{ createdAt: 'desc' }, { orderStableId: 'desc' }],
      skip: 50,
      take: 50,
      include: { items: true },
    });
  });

  it('preserves board item and time-window filters', async () => {
    findMany.mockResolvedValue([]);
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);

    try {
      await expect(
        useCase.board('4750_Yonge_Street', {
          statusIn: ['paid', 'making'],
          channelIn: ['web'],
          limit: 25,
          sinceMinutes: 60,
          requireItems: true,
        }),
      ).resolves.toEqual([]);

      expect(findMany).toHaveBeenCalledWith({
        where: {
          storeId: '4750_Yonge_Street',
          status: { in: ['paid', 'making'] },
          channel: { in: ['web'] },
          items: { some: {} },
          createdAt: { gte: new Date(1_800_000_000_000 - 60 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
        include: { items: true },
      });
    } finally {
      nowSpy.mockRestore();
    }
  });
});
