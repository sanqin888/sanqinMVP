import { OrderStatus } from '@prisma/client';

import { OrderReportingFactsReaderService } from './order-reporting-facts-reader.service';

describe('OrderReportingFactsReaderService', () => {
  it('publishes store-scoped operational Order facts on a half-open range without widening the reportable status set', async () => {
    const orderFindMany = jest.fn().mockResolvedValue([
      {
        orderStableId: 'order-stable-1',
        status: OrderStatus.completed,
        createdAt: new Date('2026-09-23T16:05:00.000Z'),
        paidAt: new Date('2026-09-23T16:05:00.000Z'),
        makingAt: new Date('2026-09-23T16:06:00.000Z'),
        readyAt: new Date('2026-09-23T16:15:00.000Z'),
        totalCents: 1599,
        subtotalCents: 1415,
        taxCents: 184,
        deliveryFeeCents: 0,
        channel: 'in_store',
        paymentMethod: 'CARD',
        fulfillmentType: 'dine_in',
      },
    ]);
    const prisma = {
      order: {
        aggregate: jest.fn(),
        groupBy: jest.fn(),
        findMany: orderFindMany,
      },
      orderItem: { findMany: jest.fn() },
    };
    const service = new OrderReportingFactsReaderService(prisma as never);
    const query = {
      storeStableId: '4750_Yonge_Street',
      fromInclusive: new Date('2026-09-23T04:00:00.000Z'),
      toExclusive: new Date('2026-09-24T04:00:00.000Z'),
    };

    await expect(service.readOperationalOrdersForRange(query)).resolves.toEqual(
      [
        {
          orderStableId: 'order-stable-1',
          storeStableId: '4750_Yonge_Street',
          status: 'completed',
          createdAt: new Date('2026-09-23T16:05:00.000Z'),
          paidAt: new Date('2026-09-23T16:05:00.000Z'),
          makingAt: new Date('2026-09-23T16:06:00.000Z'),
          readyAt: new Date('2026-09-23T16:15:00.000Z'),
          totalCents: 1599,
          subtotalCents: 1415,
          taxCents: 184,
          customerDeliveryFeeCents: 0,
          channel: 'in_store',
          primaryPaymentMethod: 'CARD',
          fulfillmentType: 'dine_in',
        },
      ],
    );

    expect(orderFindMany).toHaveBeenCalledWith({
      where: {
        storeId: '4750_Yonge_Street',
        createdAt: {
          gte: query.fromInclusive,
          lt: query.toExclusive,
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
      select: {
        orderStableId: true,
        status: true,
        createdAt: true,
        paidAt: true,
        makingAt: true,
        readyAt: true,
        totalCents: true,
        subtotalCents: true,
        taxCents: true,
        deliveryFeeCents: true,
        channel: true,
        paymentMethod: true,
        fulfillmentType: true,
      },
      orderBy: [{ createdAt: 'asc' }, { orderStableId: 'asc' }],
    });
  });

  it('keeps commercial item identity separate while publishing immutable production components for operational reporting', async () => {
    const orderItemFindMany = jest.fn().mockResolvedValue([
      {
        qty: 2,
        productStableId: 'combo_lunch',
        displayName: 'Lunch Combo',
        nameEn: 'Lunch Combo',
        nameZh: '午餐套餐',
        unitPriceCents: 1599,
        isDailySpecialApplied: true,
        componentsJson: [
          {
            productStableId: 'item_roujiamo',
            nameEn: 'Roujiamo',
            nameZh: '肉夹馍',
            quantityPerParent: 1,
            source: 'OPTION',
            sourceOptionStableId: 'choice_roujiamo',
            options: [],
          },
        ],
        order: {
          orderStableId: 'order-stable-1',
          createdAt: new Date('2026-09-23T16:05:00.000Z'),
        },
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
    const query = {
      storeStableId: '4750_Yonge_Street',
      fromInclusive: new Date('2026-09-23T04:00:00.000Z'),
      toExclusive: new Date('2026-09-24T04:00:00.000Z'),
    };

    await expect(service.readOperationalItemsForRange(query)).resolves.toEqual([
      {
        orderStableId: 'order-stable-1',
        orderCreatedAt: new Date('2026-09-23T16:05:00.000Z'),
        qty: 2,
        productStableId: 'combo_lunch',
        displayName: 'Lunch Combo',
        nameEn: 'Lunch Combo',
        nameZh: '午餐套餐',
        unitPriceCents: 1599,
        isDailySpecialApplied: true,
        components: [
          {
            productStableId: 'item_roujiamo',
            nameEn: 'Roujiamo',
            nameZh: '肉夹馍',
            quantityPerParent: 1,
          },
        ],
      },
    ]);

    expect(orderItemFindMany).toHaveBeenCalledWith({
      where: {
        order: {
          storeId: '4750_Yonge_Street',
          createdAt: {
            gte: query.fromInclusive,
            lt: query.toExclusive,
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
      },
      select: {
        qty: true,
        productStableId: true,
        displayName: true,
        nameEn: true,
        nameZh: true,
        unitPriceCents: true,
        isDailySpecialApplied: true,
        componentsJson: true,
        order: {
          select: {
            orderStableId: true,
            createdAt: true,
          },
        },
      },
    });
  });

  it('owns immutable component snapshot parsing before facts cross the Orders boundary', async () => {
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

    const items = await service.readItemsForRange(startDate, endDate);
    expect(items).toEqual([
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
  });
});
