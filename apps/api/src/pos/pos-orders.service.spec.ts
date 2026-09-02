import { PaymentMethod } from '@prisma/client';
import type { PosOrderDto } from '../orders/public-api';
import { PosOrdersService } from './pos-orders.service';

const order = (overrides: Partial<PosOrderDto> = {}): PosOrderDto =>
  ({
    orderStableId: 'order_1',
    orderNumber: 'SQ1',
    clientRequestId: 'SQ1',
    status: 'making',
    channel: 'in_store',
    items: [],
    ...overrides,
  }) as PosOrderDto;

describe('PosOrdersService', () => {
  const setup = (current: PosOrderDto) => {
    const orders = {
      getByStableIdForStore: jest.fn().mockResolvedValue(current),
      getExternalPaymentCents: jest.fn().mockResolvedValue(null),
      createFullRefund: jest.fn(),
      advanceForStore: jest
        .fn()
        .mockResolvedValue({ ...current, status: 'ready' }),
    };
    const uberEats = {
      execute: jest.fn().mockResolvedValue({
        ok: true,
        actionResult: { status: 'SUCCEEDED', actionId: 'action_1' },
      }),
      accept: jest.fn().mockResolvedValue({ ok: true }),
      deny: jest.fn().mockResolvedValue({ ok: false, status: 'QUEUED' }),
      cancel: jest.fn().mockResolvedValue({ ok: true }),
      getReadyForPickupAction: jest.fn().mockResolvedValue(null),
      retryReadyForPickup: jest.fn(),
    };
    const orderRead = {
      listAmendmentsForStore: jest.fn().mockResolvedValue([]),
    };
    const brandStoreConfigReader = {
      getStoreSnapshot: jest.fn().mockResolvedValue({
        storeStableId: '4750_Yonge_Street',
        autoAcceptOnlineOrders: true,
      }),
    };
    const brandStoreConfigWriter = {
      updateStoreConfig: jest.fn().mockResolvedValue(undefined),
    };
    return {
      service: new PosOrdersService(
        orders as never,
        uberEats as never,
        uberEats as never,
        orderRead as never,
        brandStoreConfigReader as never,
        brandStoreConfigWriter as never,
      ),
      orders,
      uberEats,
      orderRead,
      brandStoreConfigReader,
      brandStoreConfigWriter,
    };
  };

  it('reads auto-accept from the Brand/Store boundary by store stable ID', async () => {
    const { service, brandStoreConfigReader } = setup(order());
    brandStoreConfigReader.getStoreSnapshot.mockResolvedValue({
      storeStableId: '4750_Yonge_Street',
      autoAcceptOnlineOrders: false,
    });

    await expect(
      service.getAutoAcceptOnlineOrders('4750_Yonge_Street'),
    ).resolves.toEqual({ enabled: false });
    expect(brandStoreConfigReader.getStoreSnapshot).toHaveBeenCalledWith(
      '4750_Yonge_Street',
    );
  });

  it('writes auto-accept through the Brand/Store boundary by store stable ID', async () => {
    const { service, brandStoreConfigWriter } = setup(order());

    await expect(
      service.setAutoAcceptOnlineOrders('4750_Yonge_Street', false),
    ).resolves.toEqual({ enabled: false });
    expect(brandStoreConfigWriter.updateStoreConfig).toHaveBeenCalledWith(
      '4750_Yonge_Street',
      { autoAcceptOnlineOrders: false },
    );
  });

  it('普通订单仅使用本地状态推进', async () => {
    const { service, orders, uberEats } = setup(order());

    await service.advance('4750_Yonge_Street', 'order_1');

    expect(orders.advanceForStore).toHaveBeenCalledWith(
      'order_1',
      '4750_Yonge_Street',
    );
    expect(uberEats.execute).not.toHaveBeenCalled();
  });

  it('Uber pending 使用 ACCEPT 并直接重新读取 making 订单', async () => {
    const pending = order({
      channel: 'ubereats',
      clientRequestId: 'ubereats:external-123',
      status: 'pending',
    });
    const making = order({
      channel: 'ubereats',
      clientRequestId: 'ubereats:external-123',
      status: 'making',
    });
    const { service, orders, uberEats } = setup(pending);
    orders.getByStableIdForStore
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(making);

    await expect(
      service.advance('4750_Yonge_Street', 'order_1'),
    ).resolves.toMatchObject(making);

    expect(uberEats.accept).toHaveBeenCalledWith('external-123');
    expect(orders.advanceForStore).not.toHaveBeenCalled();
  });

  it('Uber ACCEPT 失败时不提前推进本地 pending 状态', async () => {
    const pending = order({
      channel: 'ubereats',
      clientRequestId: 'ubereats:external-123',
      status: 'pending',
    });
    const { service, orders, uberEats } = setup(pending);
    uberEats.accept.mockResolvedValue({ ok: false });

    await expect(
      service.advance('4750_Yonge_Street', 'order_1'),
    ).resolves.toMatchObject(pending);

    expect(orders.getByStableIdForStore).toHaveBeenCalledTimes(1);
    expect(orders.advanceForStore).not.toHaveBeenCalled();
  });

  it('两个终端同时点击时都复用 Uber ACCEPT/outbox 而不走通用推进', async () => {
    const pending = order({
      channel: 'ubereats',
      clientRequestId: 'ubereats:external-123',
      status: 'pending',
    });
    const making = { ...pending, status: 'making' } as PosOrderDto;
    const { service, orders, uberEats } = setup(pending);
    orders.getByStableIdForStore
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(pending)
      .mockResolvedValue(making);

    await Promise.all([
      service.advance('4750_Yonge_Street', 'order_1'),
      service.advance('4750_Yonge_Street', 'order_1'),
    ]);

    expect(uberEats.accept).toHaveBeenCalledTimes(2);
    expect(orders.advanceForStore).not.toHaveBeenCalled();
  });

  it('Uber webhook 订单从 making 到 ready 时委托原子 outbox 同步', async () => {
    const ready = order({
      channel: 'ubereats',
      clientRequestId: 'ubereats:external-123',
      status: 'ready',
    });
    const { service, orders, uberEats } = setup(
      order({ channel: 'ubereats', clientRequestId: 'ubereats:external-123' }),
    );
    orders.getByStableIdForStore.mockResolvedValueOnce(
      order({ channel: 'ubereats', clientRequestId: 'ubereats:external-123' }),
    );
    orders.getByStableIdForStore.mockResolvedValueOnce(ready);

    await expect(
      service.advance('4750_Yonge_Street', 'order_1'),
    ).resolves.toMatchObject(ready);

    expect(uberEats.execute).toHaveBeenCalledWith('external-123', 'ready');
    expect(orders.advanceForStore).not.toHaveBeenCalled();
  });

  it('重复 ready 点击复用 Uber 服务的幂等动作键', async () => {
    const { service, orders, uberEats } = setup(
      order({ channel: 'ubereats', clientRequestId: 'ubereats:external-123' }),
    );

    await service.advance('4750_Yonge_Street', 'order_1');
    await service.advance('4750_Yonge_Street', 'order_1');

    expect(uberEats.execute).toHaveBeenCalledTimes(2);
    expect(orders.advanceForStore).not.toHaveBeenCalled();
  });

  it('Uber 临时失败返回部分成功契约而不是通用 502', async () => {
    const { service, orders, uberEats } = setup(
      order({ channel: 'ubereats', clientRequestId: 'ubereats:external-123' }),
    );
    uberEats.execute.mockResolvedValue({
      ok: true,
      actionResult: {
        status: 'FAILED',
        retryable: true,
        actionId: 'ready_action',
        errorSummary: 'Uber 返回 HTTP 500',
      },
    });
    orders.getByStableIdForStore
      .mockResolvedValueOnce(
        order({
          channel: 'ubereats',
          clientRequestId: 'ubereats:external-123',
          status: 'making',
        }),
      )
      .mockResolvedValueOnce(
        order({
          channel: 'ubereats',
          clientRequestId: 'ubereats:external-123',
          status: 'ready',
        }),
      );

    await expect(
      service.advance('4750_Yonge_Street', 'order_1'),
    ).resolves.toMatchObject({
      status: 'ready',
      uberActionStatus: 'FAILED',
      retryable: true,
      actionId: 'ready_action',
    });
    expect(orders.advanceForStore).not.toHaveBeenCalled();
  });

  it('Uber ready 到 completed 与 Uber action 状态完全脱钩', async () => {
    const ready = order({
      channel: 'ubereats',
      clientRequestId: 'ubereats:external-123',
      status: 'ready',
    });
    const completed = { ...ready, status: 'completed' } as PosOrderDto;
    const { service, orders, uberEats } = setup(ready);
    orders.advanceForStore.mockResolvedValue(completed);
    uberEats.getReadyForPickupAction.mockResolvedValue({
      ok: false,
      actionId: 'ready_action',
      status: 'FAILED',
      retryable: true,
      error: {
        code: 'UNKNOWN',
        message: 'timeout',
        retryable: true,
      },
    });

    await expect(
      service.advance('4750_Yonge_Street', 'order_1'),
    ).resolves.toMatchObject({
      status: 'completed',
    });

    expect(orders.advanceForStore).toHaveBeenCalledWith(
      'order_1',
      '4750_Yonge_Street',
    );
    expect(uberEats.getReadyForPickupAction).not.toHaveBeenCalled();
    expect(uberEats.execute).not.toHaveBeenCalled();
  });

  it('Uber ready 到 completed 只在本地完成，不构造外部动作', async () => {
    const { service, orders, uberEats } = setup(
      order({
        channel: 'ubereats',
        clientRequestId: 'ubereats:external-123',
        status: 'ready',
      }),
    );

    await service.advance('4750_Yonge_Street', 'order_1');

    expect(orders.advanceForStore).toHaveBeenCalledWith(
      'order_1',
      '4750_Yonge_Street',
    );
    expect(uberEats.execute).not.toHaveBeenCalled();
  });

  it('POS 允许店员拒绝仍处于 pending 的 Uber 订单', async () => {
    const { service, uberEats } = setup(
      order({
        channel: 'ubereats',
        clientRequestId: 'ubereats:external-123',
        status: 'pending',
      }),
    );

    await expect(
      service.denyUberOrder(
        '4750_Yonge_Street',
        'order_1',
        'ITEM_ISSUE',
        '商品售罄',
      ),
    ).resolves.toMatchObject({
      orderStableId: 'order_1',
      uberActionStatus: 'QUEUED',
    });
    expect(uberEats.deny).toHaveBeenCalledWith(
      'external-123',
      'ITEM_ISSUE',
      '商品售罄',
    );
    await expect(
      service.getManagementActions('4750_Yonge_Street', 'order_1'),
    ).resolves.toEqual({
      actions: [{ action: 'UBER_DENY', available: true }],
    });
  });

  it('POS 不允许对已接单 Uber 订单再提交 DENY', async () => {
    const { service, uberEats } = setup(
      order({
        channel: 'ubereats',
        clientRequestId: 'ubereats:external-123',
        status: 'making',
      }),
    );

    await expect(
      service.denyUberOrder('4750_Yonge_Street', 'order_1', 'OTHER'),
    ).rejects.toThrow('只有待接单的 Uber 订单可以拒单');
    expect(uberEats.deny).not.toHaveBeenCalled();
  });

  it('POS 允许店员为已接单的 Uber 订单提交 CANCEL', async () => {
    const { service, uberEats } = setup(
      order({
        channel: 'ubereats',
        clientRequestId: 'ubereats:external-123',
        status: 'making',
      }),
    );

    await expect(
      service.cancelUberOrder(
        '4750_Yonge_Street',
        'order_1',
        ' ITEM_ISSUE ',
        ' 商品售罄 ',
      ),
    ).resolves.toMatchObject({
      orderStableId: 'order_1',
      uberActionStatus: null,
    });
    expect(uberEats.cancel).toHaveBeenCalledWith(
      'external-123',
      'ITEM_ISSUE',
      '商品售罄',
    );
  });

  it('POS 拒绝空的 Uber 取消原因代码', async () => {
    const { service, uberEats } = setup(
      order({
        channel: 'ubereats',
        clientRequestId: 'ubereats:external-123',
        status: 'making',
      }),
    );

    await expect(
      service.cancelUberOrder('4750_Yonge_Street', 'order_1', '   '),
    ).rejects.toThrow('取消原因不能为空');
    expect(uberEats.cancel).not.toHaveBeenCalled();
  });

  it('POS 在 Uber 订单 ready 后不再提供 CANCEL，避免上游成功但本地无法进入退款终态', async () => {
    const ready = order({
      channel: 'ubereats',
      clientRequestId: 'ubereats:external-123',
      status: 'ready',
    });
    const { service, uberEats } = setup(ready);

    await expect(
      service.cancelUberOrder('4750_Yonge_Street', 'order_1', 'OTHER'),
    ).rejects.toThrow('当前 Uber 订单状态不允许取消');
    await expect(
      service.getManagementActions('4750_Yonge_Street', 'order_1'),
    ).resolves.toEqual({
      actions: [
        {
          action: 'UBER_CANCEL',
          available: false,
          reason: 'ORDER_STATUS_NOT_SUPPORTED',
        },
      ],
    });
    expect(uberEats.cancel).not.toHaveBeenCalled();
  });

  it('POS 拒绝为非 Uber 订单提交 CANCEL', async () => {
    const { service, uberEats } = setup(order());

    await expect(
      service.cancelUberOrder('4750_Yonge_Street', 'order_1', 'OTHER'),
    ).rejects.toThrow('只有 Uber 订单可以提交取消');
    expect(uberEats.cancel).not.toHaveBeenCalled();
  });

  it('Web external=0 只开放 FULL_REFUND，其他管理动作继续锁定', async () => {
    const webOrder = order({
      channel: 'web',
      paymentMethod: PaymentMethod.STORE_BALANCE,
      status: 'making',
    });
    const { service, orders } = setup(webOrder);
    orders.getExternalPaymentCents.mockResolvedValue(0);

    await expect(
      service.getManagementActions('4750_Yonge_Street', 'order_1'),
    ).resolves.toEqual({
      actions: [
        {
          action: 'SWAP_ITEM',
          available: false,
          reason: 'CLOVER_SYNC_PENDING',
        },
        {
          action: 'VOID_ITEM',
          available: false,
          reason: 'CLOVER_SYNC_PENDING',
        },
        { action: 'FULL_REFUND', available: true },
        {
          action: 'CHANGE_PAYMENT',
          available: false,
          reason: 'CLOVER_SYNC_PENDING',
        },
      ],
    });
  });

  it('Web external>0 继续锁定 FULL_REFUND', async () => {
    const webOrder = order({
      channel: 'web',
      paymentMethod: PaymentMethod.CARD,
      status: 'making',
    });
    const { service, orders } = setup(webOrder);
    orders.getExternalPaymentCents.mockResolvedValue(699);

    const result = await service.getManagementActions(
      '4750_Yonge_Street',
      'order_1',
    );

    expect(result.actions).toEqual(
      expect.arrayContaining([
        {
          action: 'FULL_REFUND',
          available: false,
          reason: 'CLOVER_SYNC_PENDING',
        },
      ]),
    );
  });

  it('Web external=0 可以提交零金额全额退款并保持 Benefits 原路返回', async () => {
    const webOrder = order({
      channel: 'web',
      paymentMethod: PaymentMethod.STORE_BALANCE,
      status: 'making',
    });
    const { service, orders } = setup(webOrder);
    orders.getExternalPaymentCents.mockResolvedValue(0);
    orders.createFullRefund.mockResolvedValue({
      order: { ...webOrder, status: 'refunded' },
      outcome: 'refunded',
    });

    await expect(
      service.createFullRefund('4750_Yonge_Street', 'order_1', {
        reason: '顾客取消',
        operatorName: 'Staff',
        refundAmountCents: 0,
        originalPaymentMethod: PaymentMethod.STORE_BALANCE,
        refundMethod: PaymentMethod.STORE_BALANCE,
      }),
    ).resolves.toMatchObject({ outcome: 'refunded' });

    expect(orders.createFullRefund).toHaveBeenCalledWith({
      orderStableId: 'order_1',
      reason: '顾客取消 · 操作人:Staff',
      refundAmountCents: 0,
      originalPaymentMethod: PaymentMethod.STORE_BALANCE,
      refundMethod: PaymentMethod.STORE_BALANCE,
    });
  });

  it('Web external>0 不允许绕过 Clover 同步锁直接全额退款', async () => {
    const webOrder = order({
      channel: 'web',
      paymentMethod: PaymentMethod.CARD,
      status: 'making',
    });
    const { service, orders } = setup(webOrder);
    orders.getExternalPaymentCents.mockResolvedValue(699);

    await expect(
      service.createFullRefund('4750_Yonge_Street', 'order_1', {
        reason: '顾客取消',
        operatorName: 'Staff',
        refundAmountCents: 699,
        originalPaymentMethod: PaymentMethod.CARD,
        refundMethod: PaymentMethod.CARD,
      }),
    ).rejects.toThrow('external payment reversal is not available');

    expect(orders.createFullRefund).not.toHaveBeenCalled();
  });

  it('改单历史只通过 Orders public read boundary 读取', async () => {
    const { service, orderRead } = setup(order());
    orderRead.listAmendmentsForStore.mockResolvedValue([
      {
        amendmentStableId: 'amendment_1',
        type: 'VOID_ITEM',
        paymentMethod: 'CASH',
        reason: '商品售罄 · 操作人:Staff',
        deltaCents: -500,
        refundCents: 500,
        additionalChargeCents: 0,
        summaryJson: null,
        items: [],
      },
    ]);

    await expect(
      service.listAmendments('4750_Yonge_Street', 'order_1'),
    ).resolves.toEqual([
      {
        amendmentStableId: 'amendment_1',
        type: 'VOID_ITEM',
        paymentMethod: 'CASH',
        reason: '商品售罄',
        operatorName: 'Staff',
        deltaCents: -500,
        refundCents: 500,
        additionalChargeCents: 0,
        summaryJson: null,
        items: [],
      },
    ]);
    expect(orderRead.listAmendmentsForStore).toHaveBeenCalledWith(
      'order_1',
      '4750_Yonge_Street',
    );
  });
});
