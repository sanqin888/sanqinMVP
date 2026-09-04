import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';

import { PosOrdersController } from './pos-orders.controller';

describe('PosOrdersController Uber orders', () => {
  const orders = {
    board: jest.fn(),
    recent: jest.fn(),
    createForStore: jest.fn(),
    quotePricingForStore: jest.fn(),
    getByStableIdForStore: jest.fn(),
    updateStatusForStore: jest.fn(),
    listUpcomingScheduledForStore: jest.fn(),
    getFulfillmentTimingsForStore: jest.fn(),
    getFulfillmentTimingForStore: jest.fn(),
    activateScheduledPreparation: jest.fn(),
  };
  const posOrders = {
    cancelUberOrder: jest.fn(),
    denyUberOrder: jest.fn(),
    getAutoAcceptOnlineOrders: jest.fn(),
    setAutoAcceptOnlineOrders: jest.fn(),
  };
  const posCardPaymentFeature = {
    isEnabled: jest.fn(() => false),
  };
  const posRequest = {
    posDevice: {
      deviceStableId: 'device-1',
      storeStableId: '4750_Yonge_Street',
      name: 'Front POS',
    },
  } as never;
  const controller = new PosOrdersController(
    orders as never,
    {} as never,
    {} as never,
    {} as never,
    posOrders as never,
    posCardPaymentFeature as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    posCardPaymentFeature.isEnabled.mockReturnValue(false);
  });

  it('POS pricing quote uses authenticated store identity through Orders public API', async () => {
    const dto = {
      channel: 'in_store',
      fulfillmentType: 'pickup',
      items: [{ productStableId: 'item-1', qty: 2 }],
      discountCents: 100,
    } as const;
    const quote = {
      subtotalCents: 2000,
      displaySubtotalCents: 2000,
      couponDiscountCents: 0,
      automaticPromotionDiscountCents: 1000,
      posManualDiscountCents: 100,
      loyaltyRedeemCents: 0,
      taxCents: 117,
      deliveryFeeCents: 0,
      totalCents: 1017,
      appliedDiscounts: [],
    };
    orders.quotePricingForStore.mockResolvedValue(quote);

    await expect(controller.quotePricing(posRequest, dto as never)).resolves.toEqual(
      quote,
    );
    expect(orders.quotePricingForStore).toHaveBeenCalledWith(
      dto,
      '4750_Yonge_Street',
    );
  });

  it('POS pricing quote rejects non in-store channels', () => {
    expect(() =>
      controller.quotePricing(
        posRequest,
        {
          channel: 'ubereats',
          fulfillmentType: 'pickup',
          items: [],
        } as never,
      ),
    ).toThrow(BadRequestException);
    expect(orders.quotePricingForStore).not.toHaveBeenCalled();
  });

  it('feature flag=false 时保留 legacy POS CARD 创建路径', async () => {
    const dto = {
      channel: 'in_store',
      fulfillmentType: 'pickup',
      paymentMethod: 'CARD',
      items: [],
    } as const;
    orders.createForStore.mockResolvedValue({
      orderStableId: 'legacy-card-order',
    });

    await expect(controller.create(posRequest, dto as never)).resolves.toEqual({
      orderStableId: 'legacy-card-order',
    });
    expect(orders.createForStore).toHaveBeenCalledWith(
      dto,
      '4750_Yonge_Street',
    );
  });

  it('feature flag=true 时服务端拒绝绕过 Clover 的 legacy CARD 创建', async () => {
    posCardPaymentFeature.isEnabled.mockReturnValue(true);
    const dto = {
      channel: 'in_store',
      fulfillmentType: 'pickup',
      paymentMethod: 'CARD',
      items: [],
    } as const;

    await expect(
      controller.create(posRequest, dto as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(orders.createForStore).not.toHaveBeenCalled();
  });

  it('POS 建单缺少 authenticated store identity 时拒绝创建', async () => {
    const dto = {
      channel: 'in_store',
      fulfillmentType: 'pickup',
      paymentMethod: 'CASH',
      items: [],
    } as const;

    await expect(
      controller.create(
        {
          posDevice: {
            deviceStableId: 'device-1',
            storeStableId: '   ',
            name: 'Front POS',
          },
        } as never,
        dto as never,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(orders.createForStore).not.toHaveBeenCalled();
  });

  it('POS 订单详情始终把 authenticated store identity 传入 Orders 边界', async () => {
    orders.getByStableIdForStore.mockResolvedValue({
      orderStableId: 'order_1',
    });

    await expect(controller.findOne(posRequest, 'order_1')).resolves.toEqual({
      orderStableId: 'order_1',
    });
    expect(orders.getByStableIdForStore).toHaveBeenCalledWith(
      'order_1',
      '4750_Yonge_Street',
    );
  });

  it('POS 最近订单按 authenticated store identity 查询', async () => {
    orders.recent.mockResolvedValue([]);

    await expect(controller.recent(posRequest, 10)).resolves.toEqual([]);
    expect(orders.recent).toHaveBeenCalledWith('4750_Yonge_Street', 10);
  });

  it('POS 普通看板排除尚未激活的预约单', async () => {
    orders.board.mockResolvedValue([
      { orderStableId: 'scheduled_1' },
      { orderStableId: 'immediate_1' },
    ]);
    orders.listUpcomingScheduledForStore.mockResolvedValue([
      { orderStableId: 'scheduled_1' },
    ]);
    orders.getFulfillmentTimingsForStore.mockResolvedValue(
      new Map([
        ['scheduled_1', 'SCHEDULED'],
        ['immediate_1', 'IMMEDIATE'],
      ]),
    );

    await expect(
      controller.board(
        {
          posDevice: {
            deviceStableId: 'device-1',
            storeStableId: '4750_Yonge_Street',
            name: 'Front POS',
          },
        } as never,
        'pending,paid,making,ready',
        undefined,
        80,
        180,
      ),
    ).resolves.toEqual([
      { orderStableId: 'immediate_1', fulfillmentTiming: 'IMMEDIATE' },
    ]);

    expect(orders.listUpcomingScheduledForStore).toHaveBeenCalledWith(
      '4750_Yonge_Street',
    );
    expect(orders.getFulfillmentTimingsForStore).toHaveBeenCalledWith(
      ['scheduled_1', 'immediate_1'],
      '4750_Yonge_Street',
    );
    expect(orders.board).toHaveBeenCalledWith('4750_Yonge_Street', {
      statusIn: ['pending', 'paid', 'making', 'ready'],
      channelIn: undefined,
      limit: 80,
      sinceMinutes: 180,
    });
  });

  it('已激活预约单进入右侧看板后仍保留预约身份', async () => {
    orders.board.mockResolvedValue([{ orderStableId: 'scheduled_active' }]);
    orders.listUpcomingScheduledForStore.mockResolvedValue([]);
    orders.getFulfillmentTimingsForStore.mockResolvedValue(
      new Map([['scheduled_active', 'SCHEDULED']]),
    );

    await expect(
      controller.board(
        {
          posDevice: {
            deviceStableId: 'device-1',
            storeStableId: '4750_Yonge_Street',
            name: 'Front POS',
          },
        } as never,
        'pending,paid,making,ready',
        undefined,
        80,
        180,
      ),
    ).resolves.toEqual([
      { orderStableId: 'scheduled_active', fulfillmentTiming: 'SCHEDULED' },
    ]);
  });

  it('POS scheduled queue uses the authenticated store through Orders public API', async () => {
    const scheduledOrders = [{ orderStableId: 'scheduled_1' }];
    orders.listUpcomingScheduledForStore.mockResolvedValue(scheduledOrders);

    await expect(controller.listScheduledOrders(posRequest)).resolves.toEqual({
      orders: scheduledOrders,
    });
    expect(orders.listUpcomingScheduledForStore).toHaveBeenCalledWith(
      '4750_Yonge_Street',
    );
  });

  it('POS manual scheduled preparation delegates through Orders public API', async () => {
    orders.getFulfillmentTimingForStore
      .mockResolvedValueOnce({
        orderStableId: 'scheduled_1',
        fulfillmentTiming: 'SCHEDULED',
        status: 'paid',
      })
      .mockResolvedValueOnce({
        orderStableId: 'scheduled_1',
        fulfillmentTiming: 'SCHEDULED',
        status: 'making',
      });

    await expect(
      controller.startPreparationEarly(posRequest, 'scheduled_1'),
    ).resolves.toEqual(
      expect.objectContaining({
        orderStableId: 'scheduled_1',
        status: 'making',
      }),
    );
    expect(orders.activateScheduledPreparation).toHaveBeenCalledWith(
      'scheduled_1',
      '4750_Yonge_Street',
    );
  });

  it('POS 将人工拒单提交到 Uber DENY 应用边界', async () => {
    posOrders.denyUberOrder.mockResolvedValue({ actionId: 'deny-1' });

    await expect(
      controller.denyUberOrder(posRequest, 'order_1', {
        reasonCode: 'ITEM_ISSUE',
        reasonDetail: '商品售罄',
      }),
    ).resolves.toEqual({ actionId: 'deny-1' });
    expect(posOrders.denyUberOrder).toHaveBeenCalledWith(
      '4750_Yonge_Street',
      'order_1',
      'ITEM_ISSUE',
      '商品售罄',
    );
  });

  it('POS 自动接单设置按设备所属门店读写', async () => {
    posOrders.getAutoAcceptOnlineOrders.mockResolvedValue({ enabled: false });
    posOrders.setAutoAcceptOnlineOrders.mockResolvedValue({ enabled: true });
    const req = {
      posDevice: {
        deviceStableId: 'device-1',
        storeStableId: '4750_Yonge_Street',
        name: 'Front POS',
      },
    } as never;

    await expect(controller.getAutoAcceptOnlineOrders(req)).resolves.toEqual({
      enabled: false,
    });
    await expect(
      controller.setAutoAcceptOnlineOrders(req, { enabled: true }),
    ).resolves.toEqual({ enabled: true });
    expect(posOrders.getAutoAcceptOnlineOrders).toHaveBeenCalledWith(
      '4750_Yonge_Street',
    );
    expect(posOrders.setAutoAcceptOnlineOrders).toHaveBeenCalledWith(
      '4750_Yonge_Street',
      true,
    );
  });

  it('POS 将店员主动取消提交到 Uber CANCEL 应用边界', async () => {
    posOrders.cancelUberOrder.mockResolvedValue({ actionId: 'action-1' });

    await expect(
      controller.cancelUberOrder(posRequest, 'order_1', {
        reasonCode: 'ITEM_ISSUE',
        reasonDetail: '商品售罄',
      }),
    ).resolves.toEqual({ actionId: 'action-1' });
    expect(posOrders.cancelUberOrder).toHaveBeenCalledWith(
      '4750_Yonge_Street',
      'order_1',
      'ITEM_ISSUE',
      '商品售罄',
    );
  });
});
