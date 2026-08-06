import { BadRequestException } from '@nestjs/common';
import { PosOrdersController } from './pos-orders.controller';

describe('PosOrdersController Uber cancellation', () => {
  const posOrders = { cancelUberOrder: jest.fn() };
  const controller = new PosOrdersController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    posOrders as never,
  );

  beforeEach(() => jest.clearAllMocks());

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
