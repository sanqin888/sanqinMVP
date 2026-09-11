import { OrderStatus } from '@prisma/client';

import { OrderReportingFactsReaderService } from './order-reporting-facts-reader.service';

describe('OrderReportingFactsReaderService', () => {
  it(
    'preserves the reportable Order status set and current metric query semantics',
    async () => {
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
      const findMany = jest.fn().mockResolvedValue([
        {
          createdAt: new Date('2026-09-02T04:30:00.000Z'),
          totalCents: 2146,
        },
        {
          createdAt: new Date('2026-09-02T15:00:00.000Z'),
          totalCents: 507,
        },
      ]);
      const prisma = {
        order: { aggregate, groupBy, findMany },
        orderItem: { findMany: jest.fn() },
      };
      const service = new OrderReportingFactsReaderService(prisma as never);
      const startDate = new Date('2026-09-02T04:00:00.000Z');
      const endDate = new Date('2026-09-03T03:59:59.999Z');

      await expect(
        service.readMetricsForRange(startDate, endDate),
      ).resolves.toEqual({
        totalCents: 2653,
        subtotalCents: 2300,
        taxCents: 299,
        deliveryFeeCents: 54,
        orderCount: 2,
        payment: [
          { name: 'CASH', totalCents: 2146 },
          { name: 'CARD', totalCents: 507 },
        ],
        fulfillment: [{ name: 'DINE_IN', totalCents: 2653 }],
        timeline: [
          {
            createdAt: new Date('2026-09-02T04:30:00.000Z'),
            totalCents: 2146,
          },
          {
            createdAt: new Date('2026-09-02T15:00:00.000Z'),
            totalCents: 507,
          },
        ],
      });

      const where = {
        createdAt: { gte: startDate, lte: endDate },
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
      expect(findMany).toHaveBeenCalledWith({
        where,
        select: { createdAt: true, totalCents: true },
        orderBy: { createdAt: 'asc' },
      });
    },
  );

  it(
    'owns immutable component snapshot parsing before facts cross the Orders boundary',
    async () => {
      const orderItemFindMany = jest.fn().mockResolvedValue([
        {
          qty: 2,
          productStableId: 'combo_lunch',
          displayName: 'Lunch Combo',
          nameEn: 'Lunch Combo',
          nameZh: '午餐套餐',
          componentsJson: [
            {
              productStableId: 'item_chicken',
              nameEn: 'Chicken',
              nameZh: '鸡肉',
              quantityPerParent: 1,
              source: 'OPTION',
              sourceOptionStableId: 'choice_chicken',
              options: [],
            },
          ],
        },
        {
          qty: 1,
          productStableId: 'combo_legacy',
          displayName: 'Legacy Combo',
          nameEn: 'Legacy Combo',
          nameZh: '旧套餐',
          componentsJson: null,
        },
      ]);
      const prisma = {
        order: {
          aggregate: jest.fn(),
          groupBy: jest.fn(),
          findMany: jest.fn(),
        },
        orderItem: { findMany: orderItemFindMany },
      };
      const service = new OrderReportingFactsReaderService(prisma as never);
      const startDate = new Date('2026-09-02T04:00:00.000Z');
      const endDate = new Date('2026-09-03T03:59:59.999Z');

      await expect(
        service.readItemsForRange(startDate, endDate),
      ).resolves.toEqual([
        {
          qty: 2,
          productStableId: 'combo_lunch',
          displayName: 'Lunch Combo',
          nameEn: 'Lunch Combo',
          nameZh: '午餐套餐',
          components: [
            {
              productStableId: 'item_chicken',
              nameEn: 'Chicken',
              nameZh: '鸡肉',
              quantityPerParent: 1,
            },
          ],
        },
        {
          qty: 1,
          productStableId: 'combo_legacy',
          displayName: 'Legacy Combo',
          nameEn: 'Legacy Combo',
          nameZh: '旧套餐',
          components: [],
        },
      ]);

      expect(orderItemFindMany).toHaveBeenCalledWith({
        where: {
          order: {
            createdAt: { gte: startDate, lte: endDate },
            status: {
              in: [
                OrderStatus.paid,
                OrderStatus.making,
                OrderStatus.ready,
                OrderStatus.completed,
              ],
            },
          },
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
    },
  );
});
