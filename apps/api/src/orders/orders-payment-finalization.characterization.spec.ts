import { Channel, FulfillmentType, PaymentMethod } from '@prisma/client';
import {
  OrdersService,
  type PreparedPaymentOrderSnapshot,
} from './orders.service';

const snapshot = (): PreparedPaymentOrderSnapshot => ({
  version: 1,
  order: {
    channel: Channel.in_store,
    fulfillmentType: FulfillmentType.pickup,
    paymentMethod: PaymentMethod.CARD,
    userStableId: 'customer_stable_1',
    items: [],
  } as PreparedPaymentOrderSnapshot['order'],
  userId: '8a3d4c0e-4750-4f6a-9138-000000000010',
  storeId: '4750_Yonge_Street',
  pricing: {
    subtotalCents: 2000,
    displaySubtotalCents: 2000,
    couponDiscountCents: 200,
    automaticPromotionDiscountCents: 300,
    posManualDiscountCents: 100,
    loyaltyRedeemCents: 400,
    taxCents: 130,
    deliveryFeeCents: 0,
    totalCents: 1130,
    appliedDiscounts: [],
  },
  tender: {
    pointsCents: 400,
    balanceCents: 300,
    couponDiscountCents: 200,
    orderTotalCents: 1130,
    externalCents: 830,
  },
  items: [
    {
      id: 'order-item-1',
      productStableId: 'product_stable_1',
      qty: 2,
      displayName: 'Roujiamo',
      nameEn: 'Roujiamo',
      nameZh: '肉夹馍',
      unitPriceCents: 1000,
      baseUnitPriceCents: 1000,
      optionsUnitPriceCents: 0,
      isDailySpecialApplied: false,
      dailySpecialStableId: null,
      optionsJson: null,
      componentsJson: null,
    },
  ],
  promotionSnapshot: { version: 1, adjustments: [] },
  coupon: {
    id: '8a3d4c0e-4750-4f6a-9138-000000000020',
    couponStableId: 'coupon_stable_1',
    code: 'SAVE2',
    title: 'Save $2',
    minSpendCents: 1000,
    expiresAt: null,
  },
  preparedAt: '2026-09-05T20:00:00.000Z',
});

function makeCreatedOrder(input: {
  id: string;
  orderStableId: string;
  data?: Record<string, unknown>;
}) {
  return {
    id: input.id,
    orderStableId: input.orderStableId,
    clientRequestId: 'SQT2609050001',
    status: 'paid',
    channel: Channel.in_store,
    fulfillmentType: FulfillmentType.pickup,
    paymentMethod: PaymentMethod.CARD,
    pickupCode: '0001',
    externalOrderNotes: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    deliveryType: null,
    deliveryProvider: null,
    deliveryEtaMinMinutes: null,
    deliveryEtaMaxMinutes: null,
    subtotalCents: 2000,
    taxCents: 130,
    deliveryFeeCents: 0,
    deliveryCostCents: 0,
    deliverySubsidyCents: 0,
    totalCents: 1130,
    paymentTotalCents: 1170,
    creditCardSurchargeCents: 40,
    couponCodeSnapshot: 'SAVE2',
    couponTitleSnapshot: 'Save $2',
    couponDiscountCents: 200,
    loyaltyRedeemCents: 400,
    subtotalAfterDiscountCents: 1000,
    promotionSnapshot: { version: 1, adjustments: [] },
    createdAt: new Date('2026-09-05T20:01:00.000Z'),
    paidAt: new Date('2026-09-05T20:01:00.000Z'),
    items: [],
    ...input.data,
  };
}

describe('OrdersService confirmed-payment finalization characterization', () => {
  it('commits Benefits and Coupon reservations in the same transaction that creates the paid Order snapshot', async () => {
    const outerFindUnique = jest.fn().mockResolvedValue(null);
    const orderCreate = jest
      .fn()
      .mockImplementation(({ data }: { data: unknown }) =>
        Promise.resolve(
          makeCreatedOrder({
            id: '8a3d4c0e-4750-4f6a-9138-000000000030',
            orderStableId: 'order_stable_1',
            data: data as Record<string, unknown>,
          }),
        ),
      );
    const createLifecycleEvent = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      order: { create: orderCreate },
      opsEvent: { createMany: createLifecycleEvent },
    };
    const transaction = jest.fn(
      (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    );
    const commitTender = jest.fn().mockResolvedValue({
      pointsValueCents: 400,
      balanceCents: 300,
    });
    const commitCoupons = jest.fn().mockResolvedValue(undefined);
    const paidSideEffects = jest.fn().mockResolvedValue(undefined);
    const toOrderDto = jest.fn((order: unknown) => order);
    const allocateClientRequestIdTx = jest
      .fn()
      .mockResolvedValue('SQT2609050001');

    const service = Object.create(OrdersService.prototype) as OrdersService;
    Object.assign(service as unknown as Record<string, unknown>, {
      prisma: {
        order: { findUnique: outerFindUnique },
        $transaction: transaction,
      },
      loyalty: { commitPaymentTenderForOrder: commitTender },
      membership: { commitPaymentCouponsForOrder: commitCoupons },
      allocateClientRequestIdTx,
      handleOrderPaidSideEffects: paidSideEffects,
      toOrderDto,
      logger: { log: jest.fn() },
    });

    const result = await service.createFromConfirmedPaymentSnapshot(
      snapshot(),
      {
        attemptId: 'attempt-1',
        internalOrderId: '8a3d4c0e-4750-4f6a-9138-000000000030',
        orderStableId: 'order_stable_1',
        cardSurchargeCents: 40,
        chargedTotalCents: 870,
      },
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(commitTender).toHaveBeenCalledWith({
      tx,
      attemptId: 'attempt-1',
      orderId: '8a3d4c0e-4750-4f6a-9138-000000000030',
      orderStableId: 'order_stable_1',
    });
    expect(commitCoupons).toHaveBeenCalledWith({
      tx,
      attemptId: 'attempt-1',
      orderId: '8a3d4c0e-4750-4f6a-9138-000000000030',
      orderStableId: 'order_stable_1',
    });
    expect(orderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: '8a3d4c0e-4750-4f6a-9138-000000000030',
          orderStableId: 'order_stable_1',
          storeId: '4750_Yonge_Street',
          status: 'paid',
          paymentMethod: PaymentMethod.CARD,
          subtotalCents: 2000,
          taxCents: 130,
          totalCents: 1130,
          paymentTotalCents: 1170,
          creditCardSurchargeCents: 40,
          paymentBreakdownJson: expect.objectContaining({
            pointsCents: 400,
            balanceCents: 300,
            externalCents: 830,
            cardCents: 830,
            cardSurchargeCents: 40,
            externalChargedCents: 870,
          }) as unknown,
          items: {
            create: [
              expect.objectContaining({
                id: 'order-item-1',
                productStableId: 'product_stable_1',
                qty: 2,
                unitPriceCents: 1000,
              }),
            ],
          },
        }) as unknown,
        include: { items: true },
      }),
    );
    expect(createLifecycleEvent).toHaveBeenCalledWith({
      data: {
        idempotencyKey: 'order.accepted:order_stable_1',
        eventName: 'order.accepted',
        source: 'orders.lifecycle',
        payload: { orderStableId: 'order_stable_1' },
      },
      skipDuplicates: true,
    });
    expect(paidSideEffects).toHaveBeenCalledTimes(1);
    expect(result.internalOrderId).toBe('8a3d4c0e-4750-4f6a-9138-000000000030');
  });

  it('returns an already-created Order by orderStableId without recommitting reservations or replaying paid side effects', async () => {
    const existing = makeCreatedOrder({
      id: '8a3d4c0e-4750-4f6a-9138-000000000031',
      orderStableId: 'order_stable_existing',
    });
    const transaction = jest.fn();
    const commitTender = jest.fn();
    const commitCoupons = jest.fn();
    const paidSideEffects = jest.fn();
    const toOrderDto = jest.fn().mockReturnValue({
      orderStableId: 'order_stable_existing',
    });

    const service = Object.create(OrdersService.prototype) as OrdersService;
    Object.assign(service as unknown as Record<string, unknown>, {
      prisma: {
        order: { findUnique: jest.fn().mockResolvedValue(existing) },
        $transaction: transaction,
      },
      loyalty: { commitPaymentTenderForOrder: commitTender },
      membership: { commitPaymentCouponsForOrder: commitCoupons },
      handleOrderPaidSideEffects: paidSideEffects,
      toOrderDto,
    });

    await expect(
      service.createFromConfirmedPaymentSnapshot(snapshot(), {
        attemptId: 'attempt-existing',
        internalOrderId: '8a3d4c0e-4750-4f6a-9138-000000000031',
        orderStableId: 'order_stable_existing',
        cardSurchargeCents: 40,
        chargedTotalCents: 870,
      }),
    ).resolves.toEqual({
      order: { orderStableId: 'order_stable_existing' },
      internalOrderId: '8a3d4c0e-4750-4f6a-9138-000000000031',
    });

    expect(transaction).not.toHaveBeenCalled();
    expect(commitTender).not.toHaveBeenCalled();
    expect(commitCoupons).not.toHaveBeenCalled();
    expect(paidSideEffects).not.toHaveBeenCalled();
  });
});
