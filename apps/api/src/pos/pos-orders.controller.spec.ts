import { PosOrdersController } from './pos-orders.controller';

describe('PosOrdersController Uber orders', () => {
  const orders = {
    board: jest.fn(),
  };
  const posOrders = {
    cancelUberOrder: jest.fn(),
    createFullRefund: jest.fn(),
    getManagementActions: jest.fn(),
    listAmendments: jest.fn(),
    createAmendment: jest.fn(),
  };
  const schedulingQuery = {
    listUpcomingForDeviceStore: jest.fn(),
    findTimingsByStableIds: jest.fn(),
  };
  const eventEmitter = { emit: jest.fn() };
  const controller = new PosOrdersController(
    orders as never,
    {} as never,
    {} as never,
    eventEmitter as never,
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

  it('POS 全额退款由渠道策略服务校验并要求操作人', async () => {
    posOrders.createFullRefund.mockResolvedValue({
      order: { orderStableId: 'order_1', status: 'refunded' },
      outcome: 'refunded',
    });

    await controller.fullRefund('order_1', {
      reason: '顾客取消',
      operatorName: 'Li',
      refundAmountCents: 2599,
      originalPaymentMethod: 'CARD' as never,
      refundMethod: 'CARD' as never,
    });

    expect(posOrders.createFullRefund).toHaveBeenCalledWith('order_1', {
      reason: '顾客取消',
      operatorName: 'Li',
      refundAmountCents: 2599,
      originalPaymentMethod: 'CARD',
      refundMethod: 'CARD',
    });
  });

  it('capability 查询委托 POS 渠道策略服务', async () => {
    posOrders.getManagementActions.mockResolvedValue({
      actions: [{ action: 'UBER_CANCEL', available: true }],
    });

    await expect(controller.getActions('order_1')).resolves.toEqual({
      actions: [{ action: 'UBER_CANCEL', available: true }],
    });
    expect(posOrders.getManagementActions).toHaveBeenCalledWith('order_1');
  });

  it('退菜/换菜成功后只触发差量厨房打印事件', async () => {
    posOrders.createAmendment.mockResolvedValue({ orderStableId: 'order_1' });
    const body = {
      type: 'SWAP_ITEM' as never,
      reason: '顾客换菜',
      operatorName: 'Li',
      paymentMethod: 'CARD' as never,
      refundGrossCents: 0,
      additionalChargeCents: 200,
      locale: 'zh' as const,
      items: [
        {
          action: 'VOID' as never,
          productStableId: 'old_item',
          qty: 1,
        },
        {
          action: 'ADD' as never,
          productStableId: 'new_item',
          qty: 1,
        },
      ],
    };

    await controller.createAmendment('order_1', body);

    expect(posOrders.createAmendment).toHaveBeenCalledWith(
      'order_1',
      expect.objectContaining({
        reason: '顾客换菜',
        operatorName: 'Li',
      }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'order.amendment.print',
      expect.objectContaining({
        orderStableId: 'order_1',
        reason: '顾客换菜',
        operatorName: 'Li',
        locale: 'zh',
      }),
    );
  });
});
