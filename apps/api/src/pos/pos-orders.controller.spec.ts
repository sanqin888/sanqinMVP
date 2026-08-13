import { PosOrdersController } from './pos-orders.controller';

describe('PosOrdersController Uber orders', () => {
  const orders = { createFullRefund: jest.fn() };
  const posOrders = { cancelUberOrder: jest.fn() };
  const controller = new PosOrdersController(
    orders as never,
    {} as never,
    {} as never,
    {} as never,
    posOrders as never,
  );

  beforeEach(() => jest.clearAllMocks());

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

  it('接单后的 Uber 全额退款仍提交给订单服务处理', async () => {
    orders.createFullRefund.mockResolvedValue({
      order: { orderStableId: 'order_1', status: 'completed' },
      outcome: 'pending_platform',
    });

    await controller.fullRefund('order_1', {
      reason: '顾客取消',
      refundAmountCents: 2599,
      originalPaymentMethod: 'UBEREATS' as never,
      refundMethod: 'UBEREATS' as never,
    });

    expect(orders.createFullRefund).toHaveBeenCalledWith({
      orderStableId: 'order_1',
      reason: '顾客取消',
      refundAmountCents: 2599,
      originalPaymentMethod: 'UBEREATS',
      refundMethod: 'UBEREATS',
    });
  });
});
