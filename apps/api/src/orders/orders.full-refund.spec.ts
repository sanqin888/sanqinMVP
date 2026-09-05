import { BadRequestException, ConflictException } from '@nestjs/common';
import { Channel, PaymentMethod } from '@prisma/client';
import { OrdersService } from './orders.service';

describe('OrdersService.createFullRefund', () => {
  const baseOrder = {
    id: '00000000-0000-4000-8000-000000000001',
    orderStableId: 'order_1',
    channel: Channel.ubereats,
    paymentMethod: PaymentMethod.UBEREATS,
    status: 'completed',
    totalCents: 2599,
    items: [],
  };
  const orderFindUnique = jest.fn();
  const amendmentFindFirst = jest.fn();
  const amendmentUpsert = jest.fn();
  const amendmentUpdate = jest.fn();
  const orderUpdateMany = jest.fn();
  const rollbackOnRefund = jest.fn();
  const getOrderUsage = jest.fn();
  const tx = {
    order: { findUnique: orderFindUnique, updateMany: orderUpdateMany },
    orderAmendment: {
      findFirst: amendmentFindFirst,
      upsert: amendmentUpsert,
      update: amendmentUpdate,
    },
  };
  let service: OrdersService;

  beforeEach(() => {
    jest.clearAllMocks();
    orderFindUnique.mockResolvedValue(baseOrder);
    amendmentFindFirst.mockResolvedValue(null);
    amendmentUpsert.mockResolvedValue({ id: 'amendment_1' });
    orderUpdateMany.mockResolvedValue({ count: 1 });
    rollbackOnRefund.mockResolvedValue(undefined);
    getOrderUsage.mockResolvedValue({ balancePaidCents: 0, pointsEarned: 0 });
    service = Object.create(OrdersService.prototype) as OrdersService;
    Object.assign(service, {
      prisma: {
        order: { findUnique: orderFindUnique },
        $transaction: (callback: (client: typeof tx) => unknown) =>
          callback(tx),
      },
      loyalty: {
        rollbackOnRefund,
      },
      loyaltyOrderUsageReader: {
        getOrderUsage,
      },
    });
    jest
      .spyOn(
        service as never,
        'resolveInternalOrderIdByStableIdOrThrow' as never,
      )
      .mockResolvedValue({ id: baseOrder.id } as never);
    jest
      .spyOn(service as never, 'toOrderDto' as never)
      .mockImplementation((value: never) => value);
  });

  const refund = (
    overrides: Partial<Parameters<OrdersService['createFullRefund']>[0]> = {},
  ) =>
    service.createFullRefund({
      orderStableId: baseOrder.orderStableId,
      reason: '顾客取消',
      refundAmountCents: 2599,
      originalPaymentMethod: PaymentMethod.UBEREATS,
      refundMethod: PaymentMethod.UBEREATS,
      ...overrides,
    });

  it('Uber 保持平台待确认且不提前记录退款金额', async () => {
    const result = await refund();

    expect(amendmentUpsert).toHaveBeenCalledWith({
      where: { amendmentStableId: `full_refund_${baseOrder.id}` },
      create: expect.objectContaining({
        reason: '顾客取消',
        paymentMethod: PaymentMethod.UBEREATS,
        refundCents: 0,
        summaryJson: expect.objectContaining({
          status: 'PENDING_PLATFORM',
          requestedRefundCents: 2599,
          originalChannel: Channel.ubereats,
        }) as unknown,
      }) as unknown,
      update: {},
    });
    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(result.outcome).toBe('pending_platform');
    expect(result.order.status).toBe('completed');
  });

  it.each([PaymentMethod.CASH, PaymentMethod.CARD])(
    'in_store %s 立即完成退款并记录财务金额',
    async (paymentMethod) => {
      const inStoreOrder = {
        ...baseOrder,
        channel: Channel.in_store,
        paymentMethod,
      };
      orderFindUnique
        .mockResolvedValueOnce(inStoreOrder)
        .mockResolvedValueOnce(inStoreOrder)
        .mockResolvedValueOnce({ ...inStoreOrder, status: 'refunded' });

      const result = await refund({
        originalPaymentMethod: paymentMethod,
        refundMethod: paymentMethod,
      });

      expect(amendmentUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            deltaCents: -2599,
            refundCents: 2599,
            summaryJson: expect.objectContaining({
              status: 'CONFIRMED',
            }) as unknown,
          }) as unknown,
        }),
      );
      expect(orderUpdateMany).toHaveBeenCalledWith({
        where: { id: baseOrder.id, status: { not: 'refunded' } },
        data: { status: 'refunded' },
      });
      expect(result).toEqual(
        expect.objectContaining({
          outcome: 'refunded',
          order: expect.objectContaining({ status: 'refunded' }) as unknown,
        }),
      );
    },
  );

  it('STORE_BALANCE 先幂等返还余额，再完成退款', async () => {
    const balanceOrder = {
      ...baseOrder,
      channel: Channel.in_store,
      paymentMethod: PaymentMethod.STORE_BALANCE,
    };
    orderFindUnique
      .mockResolvedValueOnce(balanceOrder)
      .mockResolvedValueOnce(balanceOrder)
      .mockResolvedValueOnce({ ...balanceOrder, status: 'refunded' });

    await refund({
      originalPaymentMethod: PaymentMethod.STORE_BALANCE,
      refundMethod: PaymentMethod.STORE_BALANCE,
    });

    expect(rollbackOnRefund).toHaveBeenCalledWith(baseOrder.id);
    expect(rollbackOnRefund.mock.invocationCallOrder[0]).toBeLessThan(
      amendmentUpsert.mock.invocationCallOrder[0],
    );
  });

  it.each([
    {
      name: '纯积分',
      totalCents: 0,
      breakdown: { pointsCents: 699, balanceCents: 0, externalCents: 0 },
    },
    {
      name: '积分加余额',
      totalCents: 1599,
      breakdown: {
        pointsCents: 1000,
        balanceCents: 1599,
        externalCents: 0,
      },
    },
  ])(
    'Web $name external=0 直接完成 Benefits 退款',
    async ({ totalCents, breakdown }) => {
      const webOrder = {
        ...baseOrder,
        channel: Channel.web,
        paymentMethod: PaymentMethod.STORE_BALANCE,
        totalCents,
        paymentBreakdownJson: breakdown,
      };
      orderFindUnique
        .mockResolvedValueOnce(webOrder)
        .mockResolvedValueOnce(webOrder)
        .mockResolvedValueOnce({ ...webOrder, status: 'refunded' });

      const result = await refund({
        refundAmountCents: totalCents,
        originalPaymentMethod: PaymentMethod.STORE_BALANCE,
        refundMethod: PaymentMethod.STORE_BALANCE,
      });

      expect(rollbackOnRefund).toHaveBeenCalledWith(baseOrder.id);
      expect(orderUpdateMany).toHaveBeenCalledWith({
        where: { id: baseOrder.id, status: { not: 'refunded' } },
        data: { status: 'refunded' },
      });
      expect(amendmentUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            refundCents: totalCents,
            summaryJson: expect.objectContaining({
              status: 'CONFIRMED',
              externalPaymentCents: 0,
              settlementScope: 'INTERNAL_BENEFITS',
            }) as unknown,
          }) as unknown,
        }),
      );
      expect(result.outcome).toBe('refunded');
    },
  );

  it('Web external>0 保持 pending_manual 且不提前回滚 Benefits', async () => {
    const webOrder = {
      ...baseOrder,
      channel: Channel.web,
      paymentMethod: PaymentMethod.CARD,
      paymentBreakdownJson: {
        pointsCents: 0,
        balanceCents: 1599,
        externalCents: 1000,
      },
    };
    orderFindUnique.mockResolvedValue(webOrder);

    const result = await refund({
      originalPaymentMethod: PaymentMethod.CARD,
      refundMethod: PaymentMethod.CARD,
    });

    expect(rollbackOnRefund).not.toHaveBeenCalled();
    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(result.outcome).toBe('pending_manual');
  });

  it('旧 Web 纯积分订单 total=0 时直接识别 external=0', async () => {
    orderFindUnique.mockResolvedValue({
      ...baseOrder,
      channel: Channel.web,
      paymentMethod: PaymentMethod.STORE_BALANCE,
      totalCents: 0,
      paymentBreakdownJson: null,
    });

    await expect(service.getExternalPaymentCents('order_1')).resolves.toBe(0);
    expect(getOrderUsage).not.toHaveBeenCalled();
  });

  it('旧 Web 余额订单按实际余额 ledger 反推 external=0', async () => {
    orderFindUnique.mockResolvedValue({
      ...baseOrder,
      channel: Channel.web,
      paymentMethod: PaymentMethod.STORE_BALANCE,
      paymentBreakdownJson: null,
    });
    getOrderUsage.mockResolvedValue({
      balancePaidCents: 2599,
      pointsEarned: 0,
    });

    await expect(service.getExternalPaymentCents('order_1')).resolves.toBe(0);
    expect(getOrderUsage).toHaveBeenCalledWith({
      orderStableId: baseOrder.orderStableId,
    });
  });

  it('旧 Web 余额加外部支付订单按实际 ledger 保留 external>0', async () => {
    orderFindUnique.mockResolvedValue({
      ...baseOrder,
      channel: Channel.web,
      paymentMethod: PaymentMethod.CARD,
      paymentBreakdownJson: null,
    });
    getOrderUsage.mockResolvedValue({
      balancePaidCents: 1599,
      pointsEarned: 0,
    });

    await expect(service.getExternalPaymentCents('order_1')).resolves.toBe(
      1000,
    );
    expect(getOrderUsage).toHaveBeenCalledWith({
      orderStableId: baseOrder.orderStableId,
    });
  });

  it('已有历史 PENDING_MANUAL amendment 时原位确认而不新增记录', async () => {
    const inStoreOrder = {
      ...baseOrder,
      channel: Channel.in_store,
      paymentMethod: PaymentMethod.CASH,
    };
    orderFindUnique
      .mockResolvedValueOnce(inStoreOrder)
      .mockResolvedValueOnce(inStoreOrder)
      .mockResolvedValueOnce({ ...inStoreOrder, status: 'refunded' });
    amendmentFindFirst.mockResolvedValue({ id: 'legacy_pending' });

    await refund({
      originalPaymentMethod: PaymentMethod.CASH,
      refundMethod: PaymentMethod.CASH,
    });

    expect(amendmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'legacy_pending' },
        data: expect.objectContaining({ refundCents: 2599 }) as unknown,
      }),
    );
    expect(amendmentUpsert).not.toHaveBeenCalled();
  });

  it('已退款或并发重复请求会拒绝且不产生双重 amendment', async () => {
    orderFindUnique.mockResolvedValue({
      ...baseOrder,
      channel: Channel.in_store,
      paymentMethod: PaymentMethod.CASH,
      status: 'refunded',
    });
    await expect(
      refund({
        originalPaymentMethod: PaymentMethod.CASH,
        refundMethod: PaymentMethod.CASH,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(amendmentUpsert).not.toHaveBeenCalled();
  });

  it('拒绝把 Uber 退款转为现金支出', async () => {
    await expect(
      refund({ refundMethod: PaymentMethod.CASH }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(amendmentUpsert).not.toHaveBeenCalled();
  });

  it('拒绝非 Uber 订单使用 UBEREATS 退款方式', async () => {
    const inStoreOrder = {
      ...baseOrder,
      channel: Channel.in_store,
      paymentMethod: PaymentMethod.CASH,
    };
    orderFindUnique.mockResolvedValue(inStoreOrder);
    await expect(
      refund({ originalPaymentMethod: PaymentMethod.CASH }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(amendmentUpsert).not.toHaveBeenCalled();
  });
});
