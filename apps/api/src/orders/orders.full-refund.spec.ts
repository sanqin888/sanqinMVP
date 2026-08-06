import { BadRequestException } from '@nestjs/common';
import { Channel, PaymentMethod } from '@prisma/client';
import { OrdersService } from './orders.service';

describe('OrdersService.createFullRefund', () => {
  const order = {
    id: '00000000-0000-4000-8000-000000000001',
    orderStableId: 'order_1',
    channel: Channel.ubereats,
    paymentMethod: PaymentMethod.UBEREATS,
    status: 'completed',
    totalCents: 2599,
    items: [],
  };
  const amendmentCreate = jest.fn();
  const tx = {
    order: { findUnique: jest.fn() },
    orderAmendment: { create: amendmentCreate },
  };
  let service: OrdersService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx.order.findUnique.mockResolvedValue(order);
    amendmentCreate.mockResolvedValue({ id: 'amendment_1' });
    service = Object.create(OrdersService.prototype) as OrdersService;
    Object.assign(service, {
      prisma: {
        $transaction: (callback: (client: typeof tx) => unknown) =>
          callback(tx),
      },
    });
    jest
      .spyOn(
        service as never,
        'resolveInternalOrderIdByStableIdOrThrow' as never,
      )
      .mockResolvedValue({ id: order.id } as never);
    jest
      .spyOn(service as never, 'toOrderDto' as never)
      .mockReturnValue(order as never);
  });

  it('持久化原因、金额、原渠道，并保持订单为非退款终态', async () => {
    const result = await service.createFullRefund({
      orderStableId: order.orderStableId,
      reason: '顾客取消',
      refundAmountCents: 2599,
      originalPaymentMethod: PaymentMethod.UBEREATS,
      refundMethod: PaymentMethod.UBEREATS,
    });

    expect(amendmentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reason: '顾客取消',
        paymentMethod: PaymentMethod.UBEREATS,
        refundCents: 0,
        summaryJson: expect.objectContaining({
          status: 'PENDING_PLATFORM',
          requestedRefundCents: 2599,
          originalChannel: Channel.ubereats,
          originalPaymentMethod: PaymentMethod.UBEREATS,
          refundMethod: PaymentMethod.UBEREATS,
        }) as unknown,
      }) as unknown,
    });
    expect(result.outcome).toBe('pending_platform');
    expect(result.order.status).toBe('completed');
  });

  it('拒绝把 Uber 退款转为现金支出', async () => {
    await expect(
      service.createFullRefund({
        orderStableId: order.orderStableId,
        reason: '顾客取消',
        refundAmountCents: 2599,
        originalPaymentMethod: PaymentMethod.UBEREATS,
        refundMethod: PaymentMethod.CASH,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(amendmentCreate).not.toHaveBeenCalled();
  });
});
