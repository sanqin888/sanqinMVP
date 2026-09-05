import { AdminMemberOrdersReadService } from './admin-member-orders-read.service';

describe('AdminMemberOrdersReadService', () => {
  const createService = () => {
    const orderFindMany = jest.fn();
    const orderItemFindMany = jest.fn();
    const prisma = {
      order: { findMany: orderFindMany },
      orderItem: { findMany: orderItemFindMany },
    };
    return {
      service: new AdminMemberOrdersReadService(prisma as never),
      orderFindMany,
      orderItemFindMany,
    };
  };

  it('reads member orders by userStableId and preserves projection/order/default limit', async () => {
    const { service, orderFindMany } = createService();
    orderFindMany.mockResolvedValue([
      {
        orderStableId: 'order-stable-1',
        clientRequestId: '1001',
        createdAt: new Date('2026-09-05T14:00:00.000Z'),
        status: 'completed',
        totalCents: 1599,
        fulfillmentType: 'pickup',
        deliveryType: null,
      },
    ]);

    await expect(service.listOrders('user-stable-1')).resolves.toEqual({
      orders: [
        {
          orderStableId: 'order-stable-1',
          clientRequestId: '1001',
          createdAt: '2026-09-05T14:00:00.000Z',
          status: 'completed',
          totalCents: 1599,
          fulfillmentType: 'pickup',
          deliveryType: null,
        },
      ],
    });
    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userStableId: 'user-stable-1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    );
  });

  it('preserves legacy listOrders parseInt fallback semantics', async () => {
    const { service, orderFindMany } = createService();
    orderFindMany.mockResolvedValue([]);

    await service.listOrders('user-stable-1', '0');
    expect(orderFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 50 }),
    );

    await service.listOrders('user-stable-1', '7items');
    expect(orderFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 7 }),
    );
  });

  it('aggregates only qualifying order-item snapshots and preserves name fallback', async () => {
    const { service, orderItemFindMany } = createService();
    orderItemFindMany.mockResolvedValue([
      {
        productStableId: 'product-a',
        qty: 2,
        displayName: null,
        nameZh: null,
        nameEn: null,
      },
      {
        productStableId: 'product-a',
        qty: 3,
        displayName: 'Resolved Name',
        nameZh: null,
        nameEn: null,
      },
      {
        productStableId: 'product-b',
        qty: 4,
        displayName: '  ',
        nameZh: '中文名',
        nameEn: 'English',
      },
    ]);

    await expect(
      service.listTopPurchasedItems('user-stable-1', '10'),
    ).resolves.toEqual({
      items: [
        {
          productStableId: 'product-a',
          displayName: 'Resolved Name',
          purchaseCount: 5,
        },
        {
          productStableId: 'product-b',
          displayName: '中文名',
          purchaseCount: 4,
        },
      ],
    });
    expect(orderItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          order: {
            userStableId: 'user-stable-1',
            status: { in: ['paid', 'making', 'ready', 'completed'] },
          },
        },
      }),
    );
  });

  it('clamps top-item limit to the existing 1..50 range', async () => {
    const { service, orderItemFindMany } = createService();
    orderItemFindMany.mockResolvedValue([
      {
        productStableId: 'product-a',
        qty: 2,
        displayName: 'A',
        nameZh: null,
        nameEn: null,
      },
      {
        productStableId: 'product-b',
        qty: 1,
        displayName: 'B',
        nameZh: null,
        nameEn: null,
      },
    ]);

    await expect(
      service.listTopPurchasedItems('user-stable-1', '0'),
    ).resolves.toEqual({
      items: [
        {
          productStableId: 'product-a',
          displayName: 'A',
          purchaseCount: 2,
        },
      ],
    });

    await expect(
      service.listTopPurchasedItems('user-stable-1', '500'),
    ).resolves.toEqual({
      items: [
        {
          productStableId: 'product-a',
          displayName: 'A',
          purchaseCount: 2,
        },
        {
          productStableId: 'product-b',
          displayName: 'B',
          purchaseCount: 1,
        },
      ],
    });
  });
});
