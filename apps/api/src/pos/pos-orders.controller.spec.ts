import { BadRequestException } from '@nestjs/common';
import { PosOrdersController } from './pos-orders.controller';

describe('PosOrdersController Uber cancellation', () => {
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

  it('将 Uber 全额退款金额、原因和渠道原样提交给订单服务', async () => {
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

  it('转交原因码和说明给服务层', async () => {
    posOrders.cancelUberOrder.mockResolvedValue({
      ok: true,
      outcome: 'confirmed',
      duplicate: false,
    });
    await controller.cancelUberOrder('order_1', {
      reasonCode: ' ITEM_SOLD_OUT ',
      reasonDetail: ' 午餐售罄 ',
    });
    expect(posOrders.cancelUberOrder).toHaveBeenCalledWith(
      'order_1',
      'ITEM_SOLD_OUT',
      '午餐售罄',
    );
  });

  it.each([
    { reasonCode: '', reasonDetail: '说明' },
    { reasonCode: 'TOO_BUSY', reasonDetail: ' ' },
  ])('拒绝缺失原因字段：%p', (body) => {
    expect(() => controller.cancelUberOrder('order_1', body)).toThrow(
      BadRequestException,
    );
    expect(posOrders.cancelUberOrder).not.toHaveBeenCalled();
  });
});
