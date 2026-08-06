import { PosOrdersController } from './pos-orders.controller';

describe('PosOrdersController Uber orders', () => {
  const orders = { createFullRefund: jest.fn() };
  const controller = new PosOrdersController(
    orders as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('Uber 新订单由 webhook 自动接单，POS 不暴露拒单端点', () => {
    expect(
      'cancelUberOrder' in (controller as unknown as Record<string, unknown>),
    ).toBe(false);
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
