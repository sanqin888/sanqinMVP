import { PosOrdersController } from './pos-orders.controller';

describe('PosOrdersController Uber orders', () => {
  const orders = {
    board: jest.fn(),
  };
  const posOrders = { cancelUberOrder: jest.fn() };
  const schedulingQuery = {
    listUpcomingForDeviceStore: jest.fn(),
    findTimingsByStableIds: jest.fn(),
  };
  const controller = new PosOrdersController(
    orders as never,
    {} as never,
    {} as never,
    {} as never,
    posOrders as never,
    schedulingQuery as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('POS 普通看板排除尚未激活的预约单', async () => {
    orders.board.mockResolvedValue([
      { orderStableId: 'scheduled_1' },
      { orderStableId: 'immediate_1' },
    ]);
    schedulingQuery.listUpcomingForDeviceStore.mockResolvedValue([
      { orderStableId: 'scheduled_1' },
    ]);
    schedulingQuery.findTimingsByStableIds.mockResolvedValue(
      new Map([
        ['scheduled_1', 'SCHEDULED'],
        ['immediate_1', 'IMMEDIATE'],
      ]),
    );

    await expect(
      controller.board(
        { posDevice: { storeId: 'store-uuid-1' } } as never,
        'pending,paid,making,ready',
        undefined,
        80,
        180,
      ),
    ).resolves.toEqual([
      { orderStableId: 'immediate_1', fulfillmentTiming: 'IMMEDIATE' },
    ]);

    expect(schedulingQuery.listUpcomingForDeviceStore).toHaveBeenCalledWith(
      'store-uuid-1',
    );
    expect(schedulingQuery.findTimingsByStableIds).toHaveBeenCalledWith([
      'scheduled_1',
      'immediate_1',
    ]);
    expect(orders.board).toHaveBeenCalledWith({
      statusIn: ['pending', 'paid', 'making', 'ready'],
      channelIn: undefined,
      limit: 80,
      sinceMinutes: 180,
    });
  });

  it('已激活预约单进入右侧看板后仍保留预约身份', async () => {
    orders.board.mockResolvedValue([{ orderStableId: 'scheduled_active' }]);
    schedulingQuery.listUpcomingForDeviceStore.mockResolvedValue([]);
    schedulingQuery.findTimingsByStableIds.mockResolvedValue(
      new Map([['scheduled_active', 'SCHEDULED']]),
    );

    await expect(
      controller.board(
        { posDevice: { storeId: 'store-uuid-1' } } as never,
        'pending,paid,making,ready',
        undefined,
        80,
        180,
      ),
    ).resolves.toEqual([
      { orderStableId: 'scheduled_active', fulfillmentTiming: 'SCHEDULED' },
    ]);
  });

  it('POS 将店员主动取消提交到 Uber CANCEL 应用边界', async () => {
    posOrders.cancelUberOrder.mockResolvedValue({ actionId: 'action-1' });

    await expect(
      controller.cancelUberOrder('order_1', { reason: '商品售罄' }),
    ).resolves.toEqual({ actionId: 'action-1' });
    expect(posOrders.cancelUberOrder).toHaveBeenCalledWith(
      'order_1',
      '商品售罄',
    );
  });
});
