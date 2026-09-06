import {
  Channel,
  FulfillmentType,
  OrderAmendmentItemAction,
  OrderAmendmentType,
  PaymentMethod,
} from '@prisma/client';
import { OrdersService } from './orders.service';

describe('OrdersService amendment characterization', () => {
  it('persists the amendment, mutates the Order item snapshot, and recalculates Order totals inside one transaction', async () => {
    const currentOrder = {
      id: '8a3d4c0e-4750-4f6a-9138-000000000101',
      orderStableId: 'order_stable_amendment_1',
      status: 'paid',
      channel: Channel.in_store,
      fulfillmentType: FulfillmentType.pickup,
      paymentMethod: PaymentMethod.CASH,
      userId: null,
      subtotalCents: 2000,
      subtotalAfterDiscountCents: 1800,
      couponDiscountCents: 200,
      loyaltyRedeemCents: 0,
      taxCents: 234,
      deliveryFeeCents: 0,
      totalCents: 2034,
      items: [
        {
          id: '8a3d4c0e-4750-4f6a-9138-000000000102',
          productStableId: 'product_stable_1',
          qty: 2,
          unitPriceCents: 1000,
        },
      ],
    };
    const finalOrder = { ...currentOrder, subtotalCents: 1000, items: [] };

    const orderFindUnique = jest
      .fn()
      .mockResolvedValueOnce(currentOrder)
      .mockResolvedValueOnce(finalOrder);
    const orderUpdate = jest.fn().mockResolvedValue({});
    const amendmentCreate = jest.fn().mockResolvedValue({
      id: '8a3d4c0e-4750-4f6a-9138-000000000103',
      amendmentStableId: 'amendment_stable_1',
      orderId: currentOrder.id,
    });
    const amendmentItemCreateMany = jest.fn().mockResolvedValue({ count: 1 });
    const amendmentAggregate = jest.fn().mockResolvedValue({
      _sum: { refundCents: 0, redeemReturnCents: 0 },
    });
    const amendmentUpdate = jest.fn().mockResolvedValue({});
    const orderItemUpdate = jest.fn().mockResolvedValue({});
    const orderItemDelete = jest.fn().mockResolvedValue({});
    const orderItemCreate = jest.fn().mockResolvedValue({});

    const tx = {
      order: { findUnique: orderFindUnique, update: orderUpdate },
      orderAmendment: {
        create: amendmentCreate,
        aggregate: amendmentAggregate,
        update: amendmentUpdate,
      },
      orderAmendmentItem: { createMany: amendmentItemCreateMany },
      orderItem: {
        update: orderItemUpdate,
        delete: orderItemDelete,
        create: orderItemCreate,
      },
    };
    const transaction = jest.fn(
      (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    );
    const resolveInternalOrderIdByStableIdOrThrow = jest
      .fn()
      .mockResolvedValue({
        id: currentOrder.id,
        orderStableId: currentOrder.orderStableId,
        clientRequestId: null,
      });
    const toOrderDto = jest.fn().mockReturnValue({
      orderStableId: currentOrder.orderStableId,
    });
    const applyAmendmentAdjustments = jest.fn();

    const service = Object.create(OrdersService.prototype) as OrdersService;
    Object.assign(service as unknown as Record<string, unknown>, {
      prisma: { $transaction: transaction },
      loyalty: { applyAmendmentAdjustments },
      resolveInternalOrderIdByStableIdOrThrow,
      toOrderDto,
    });

    await expect(
      service.createAmendment({
        orderStableId: currentOrder.orderStableId,
        type: OrderAmendmentType.VOID_ITEM,
        reason: 'item unavailable',
        refundGrossCents: 1000,
        paymentMethod: PaymentMethod.CASH,
        items: [
          {
            action: OrderAmendmentItemAction.VOID,
            productStableId: 'product_stable_1',
            qty: 1,
            unitPriceCents: 1000,
            displayName: 'Roujiamo',
          },
        ],
      }),
    ).resolves.toEqual({ orderStableId: currentOrder.orderStableId });

    expect(transaction).toHaveBeenCalledTimes(1);
    const amendmentCreateArgs = amendmentCreate.mock.calls[0]?.[0] as {
      data: {
        orderId: string;
        type: OrderAmendmentType;
        paymentMethod: PaymentMethod;
        reason: string;
      };
      select: { id: boolean; amendmentStableId: boolean; orderId: boolean };
    };
    expect(amendmentCreateArgs.data).toMatchObject({
      orderId: currentOrder.id,
      type: OrderAmendmentType.VOID_ITEM,
      paymentMethod: PaymentMethod.CASH,
      reason: 'item unavailable',
    });
    expect(amendmentCreateArgs.select).toEqual({
      id: true,
      amendmentStableId: true,
      orderId: true,
    });
    expect(amendmentItemCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          amendmentId: '8a3d4c0e-4750-4f6a-9138-000000000103',
          action: OrderAmendmentItemAction.VOID,
          productStableId: 'product_stable_1',
          qty: 1,
          unitPriceCents: 1000,
        }),
      ],
    });
    expect(orderItemUpdate).toHaveBeenCalledWith({
      where: { id: '8a3d4c0e-4750-4f6a-9138-000000000102' },
      data: { qty: 1 },
    });
    expect(orderItemDelete).not.toHaveBeenCalled();
    expect(orderItemCreate).not.toHaveBeenCalled();
    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id: currentOrder.id },
      data: {
        subtotalCents: 1000,
        subtotalAfterDiscountCents: 900,
        taxCents: 117,
        totalCents: 1017,
        paymentTotalCents: 1017,
      },
    });
    const amendmentUpdateArgs = amendmentUpdate.mock.calls[0]?.[0] as {
      where: { id: string };
      data: {
        deltaCents: number;
        refundCents: number;
        additionalChargeCents: number;
        redeemReturnCents: number;
      };
    };
    expect(amendmentUpdateArgs.where).toEqual({
      id: '8a3d4c0e-4750-4f6a-9138-000000000103',
    });
    expect(amendmentUpdateArgs.data).toMatchObject({
      deltaCents: -1000,
      refundCents: 1000,
      additionalChargeCents: 0,
      redeemReturnCents: 0,
    });
    expect(applyAmendmentAdjustments).not.toHaveBeenCalled();
  });

  it('rejects an invalid SWAP_ITEM before opening a transaction', async () => {
    const transaction = jest.fn();
    const service = Object.create(OrdersService.prototype) as OrdersService;
    Object.assign(service as unknown as Record<string, unknown>, {
      prisma: { $transaction: transaction },
    });

    await expect(
      service.createAmendment({
        orderStableId: 'order_stable_amendment_2',
        type: OrderAmendmentType.SWAP_ITEM,
        reason: 'swap',
        items: [
          {
            action: OrderAmendmentItemAction.ADD,
            productStableId: 'replacement_product',
            qty: 1,
            unitPriceCents: 1000,
          },
        ],
      }),
    ).rejects.toThrow('SWAP_ITEM requires both VOID and ADD items');

    expect(transaction).not.toHaveBeenCalled();
  });
});
