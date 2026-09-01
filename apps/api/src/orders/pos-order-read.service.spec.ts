import { PosOrderReadService } from './pos-order-read.service';

describe('PosOrderReadService', () => {
  function setup() {
    const orderFindMany = jest.fn();
    const orderFindUnique = jest.fn();
    const amendmentGroupBy = jest.fn();
    const amendmentFindMany = jest.fn();
    const prisma = {
      order: {
        findMany: orderFindMany,
        findUnique: orderFindUnique,
      },
      orderAmendment: {
        groupBy: amendmentGroupBy,
        findMany: amendmentFindMany,
      },
    };
    const orders = {
      getByStableIdForStore: jest.fn(),
    };
    return {
      service: new PosOrderReadService(prisma as never, orders as never),
      orders,
      orderFindMany,
      orderFindUnique,
      amendmentGroupBy,
      amendmentFindMany,
    };
  }

  it(
    'keeps internal order DB ids inside Orders while returning POS financial projections',
    async () => {
      const { service, orderFindMany, amendmentGroupBy } = setup();
      orderFindMany.mockResolvedValue([
        {
          id: '8a3d4c0e-4750-4f6a-9138-000000000001',
          orderStableId: 'order_stable_1',
          clientRequestId: 'SQ1001',
          paidAt: new Date('2026-08-05T12:00:00.000Z'),
          channel: 'in_store',
          fulfillmentType: 'pickup',
          status: 'refunded',
          subtotalCents: 1000,
          subtotalAfterDiscountCents: 900,
          totalCents: 1017,
          taxCents: 117,
          deliveryFeeCents: 0,
          deliveryCostCents: 0,
          paymentMethod: 'CASH',
        },
      ]);
      amendmentGroupBy.mockResolvedValue([
        {
          orderId: '8a3d4c0e-4750-4f6a-9138-000000000001',
          _sum: { refundCents: 500, additionalChargeCents: 50 },
        },
      ]);

      const result = await service.listFinancialSummaryOrders({
        storeStableId: '4750_Yonge_Street',
        paidFrom: new Date('2026-08-05T00:00:00.000Z'),
        paidToExclusive: new Date('2026-08-06T00:00:00.000Z'),
      });

      expect(orderFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            storeId: '4750_Yonge_Street',
            paidAt: {
              gte: new Date('2026-08-05T00:00:00.000Z'),
              lt: new Date('2026-08-06T00:00:00.000Z'),
            },
          },
        }),
      );
      expect(amendmentGroupBy).toHaveBeenCalledWith({
        by: ['orderId'],
        where: {
          orderId: { in: ['8a3d4c0e-4750-4f6a-9138-000000000001'] },
        },
        _sum: { refundCents: true, additionalChargeCents: true },
      });
      expect(result).toEqual([
        expect.objectContaining({
          orderStableId: 'order_stable_1',
          refundCents: 500,
          additionalChargeCents: 50,
        }),
      ]);
      expect(result[0]).not.toHaveProperty('id');
      expect(result[0]).not.toHaveProperty('orderId');
    },
  );

  it(
    'skips amendment aggregation when the store has no orders in the window',
    async () => {
      const { service, orderFindMany, amendmentGroupBy } = setup();
      orderFindMany.mockResolvedValue([]);

      await expect(
        service.listFinancialSummaryOrders({
          storeStableId: '4750_Yonge_Street',
          paidFrom: new Date('2026-08-05T00:00:00.000Z'),
          paidToExclusive: new Date('2026-08-06T00:00:00.000Z'),
        }),
      ).resolves.toEqual([]);
      expect(amendmentGroupBy).not.toHaveBeenCalled();
    },
  );

  it(
    'checks store-scoped access before resolving amendment persistence ids',
    async () => {
      const { service, orders, orderFindUnique, amendmentFindMany } = setup();
      orders.getByStableIdForStore.mockResolvedValue({
        orderStableId: 'order_stable_1',
      });
      orderFindUnique.mockResolvedValue({
        id: '8a3d4c0e-4750-4f6a-9138-000000000001',
      });
      amendmentFindMany.mockResolvedValue([
        {
          amendmentStableId: 'amendment_stable_1',
          type: 'VOID_ITEM',
          paymentMethod: 'CASH',
          reason: '商品售罄 · 操作人:Staff',
          deltaCents: -500,
          refundCents: 500,
          additionalChargeCents: 0,
          summaryJson: null,
          items: [
            {
              action: 'VOID',
              productStableId: 'product_1',
              displayName: 'Item',
              nameEn: 'Item',
              nameZh: '菜品',
              qty: 1,
              unitPriceCents: 500,
              optionsJson: null,
            },
          ],
        },
      ]);

      const result = await service.listAmendmentsForStore(
        'order_stable_1',
        '4750_Yonge_Street',
      );

      expect(orders.getByStableIdForStore).toHaveBeenCalledWith(
        'order_stable_1',
        '4750_Yonge_Street',
      );
      expect(orderFindUnique).toHaveBeenCalledWith({
        where: { orderStableId: 'order_stable_1' },
        select: { id: true },
      });
      expect(amendmentFindMany).toHaveBeenCalledWith({
        where: { orderId: '8a3d4c0e-4750-4f6a-9138-000000000001' },
        include: { items: true },
      });
      expect(result).toEqual([
        expect.objectContaining({
          amendmentStableId: 'amendment_stable_1',
          reason: '商品售罄 · 操作人:Staff',
        }),
      ]);
      expect(result[0]).not.toHaveProperty('orderId');
    },
  );
});
