import { OrderExternalCancellationFinalizerService } from './order-external-cancellation.service';

const input = {
  channel: 'ubereats' as const,
  orderStableId: 'stable-order-1',
  externalOrderId: 'uber-order-1',
  externalEventId: 'uber-event-1',
  reason: 'UBER_ORDER_FAILURE',
  operatorName: 'Uber Eats',
  occurredAt: '2026-09-10T17:00:00.000Z',
};

const serviceWithTransaction = <T extends object>(tx: T) =>
  new OrderExternalCancellationFinalizerService({
    $transaction: jest.fn((work: (client: T) => unknown) => work(tx)),
  } as never);

describe('OrderExternalCancellationFinalizerService', () => {
  it('finalizes the canonical cancellation from owner-controlled Order facts', async () => {
    const amendmentUpsert = jest.fn().mockResolvedValue({});
    const orderUpdate = jest.fn().mockResolvedValue({});
    const lifecycleCreateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      order: {
        findFirst: jest.fn().mockResolvedValue({
          id: '8a3d4c0e-4750-4f6a-9138-000000000401',
          orderStableId: 'stable-order-1',
          storeId: '4750_Yonge_Street',
          channel: 'ubereats',
          paymentMethod: 'UBEREATS',
          subtotalCents: 1_000,
          subtotalAfterDiscountCents: 1_000,
          taxCents: 130,
          deliveryFeeCents: 0,
          creditCardSurchargeCents: 0,
          totalCents: 1_130,
          paymentTotalCents: 1_130,
          items: [],
        }),
        update: orderUpdate,
      },
      orderAmendment: { upsert: amendmentUpsert },
      opsEvent: { createMany: lifecycleCreateMany },
    };
    const service = serviceWithTransaction(tx);

    await expect(service.finalizeConfirmedCancellation(input)).resolves.toEqual(
      {
        orderStableId: 'stable-order-1',
        refundCents: 1_130,
      },
    );

    expect(tx.order.findFirst).toHaveBeenCalledWith({
      where: {
        orderStableId: 'stable-order-1',
        channel: 'ubereats',
        clientRequestId: 'ubereats:uber-order-1',
      },
      select: {
        id: true,
        orderStableId: true,
        storeId: true,
        channel: true,
        paymentMethod: true,
        subtotalCents: true,
        subtotalAfterDiscountCents: true,
        taxCents: true,
        deliveryFeeCents: true,
        creditCardSurchargeCents: true,
        totalCents: true,
        paymentTotalCents: true,
        items: {
          select: {
            qty: true,
            isDailySpecialApplied: true,
          },
        },
      },
    });
    expect(amendmentUpsert).toHaveBeenCalledWith({
      where: {
        amendmentStableId: expect.stringMatching(
          /^external_cancel_[0-9a-f]{64}$/,
        ) as unknown,
      },
      create: {
        amendmentStableId: expect.stringMatching(
          /^external_cancel_[0-9a-f]{64}$/,
        ) as unknown,
        orderId: '8a3d4c0e-4750-4f6a-9138-000000000401',
        type: 'RETENDER',
        paymentMethod: 'UBEREATS',
        reason: 'UBER_ORDER_FAILURE',
        deltaCents: -1_130,
        refundCents: 1_130,
        summaryJson: {
          kind: 'EXTERNAL_CANCELLATION',
          status: 'CONFIRMED',
          channel: 'ubereats',
          eventId: 'uber-event-1',
          externalOrderId: 'uber-order-1',
          occurredAt: '2026-09-10T17:00:00.000Z',
        },
      },
      update: {},
    });
    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id: '8a3d4c0e-4750-4f6a-9138-000000000401' },
      data: { status: 'refunded' },
    });
    expect(lifecycleCreateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idempotencyKey: expect.stringMatching(
          /^order-financial-reversal:external_cancel_[0-9a-f]{64}:v1$/,
        ) as unknown,
        eventName: 'order.financial_reversal.v1',
        source: 'orders.financial',
        occurredAt: new Date(input.occurredAt),
        payload: expect.objectContaining({
          factStableId: expect.stringMatching(
            /^external_cancel_[0-9a-f]{64}$/,
          ) as unknown,
          orderStableId: 'stable-order-1',
          kind: 'REVERSAL',
          action: 'EXTERNAL_CANCELLATION',
          occurrenceEvidence: 'PROVIDER_EVENT',
        }) as unknown,
      }) as unknown,
      skipDuplicates: true,
    });
    expect(lifecycleCreateMany).toHaveBeenCalledWith({
      data: {
        idempotencyKey: 'order.cancelled:stable-order-1',
        eventName: 'order.cancelled',
        source: 'orders.lifecycle',
        payload: {
          orderStableId: 'stable-order-1',
          reason: 'UBER_ORDER_FAILURE',
          operatorName: 'Uber Eats',
        },
      },
      skipDuplicates: true,
    });
  });

  it('is replay-safe when the same provider event is finalized again', async () => {
    const amendmentUpsert = jest.fn().mockResolvedValue({});
    const lifecycleCreateMany = jest.fn().mockResolvedValue({ count: 0 });
    const tx = {
      order: {
        findFirst: jest.fn().mockResolvedValue({
          id: '8a3d4c0e-4750-4f6a-9138-000000000402',
          orderStableId: 'stable-order-1',
          storeId: '4750_Yonge_Street',
          channel: 'ubereats',
          paymentMethod: 'UBEREATS',
          subtotalCents: 1_000,
          subtotalAfterDiscountCents: 1_000,
          taxCents: 130,
          deliveryFeeCents: 0,
          creditCardSurchargeCents: 0,
          totalCents: 1_130,
          paymentTotalCents: 1_130,
          items: [],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      orderAmendment: { upsert: amendmentUpsert },
      opsEvent: { createMany: lifecycleCreateMany },
    };
    const service = serviceWithTransaction(tx);

    await expect(service.finalizeConfirmedCancellation(input)).resolves.toEqual(
      {
        orderStableId: 'stable-order-1',
        refundCents: 1_130,
      },
    );
    await expect(service.finalizeConfirmedCancellation(input)).resolves.toEqual(
      {
        orderStableId: 'stable-order-1',
        refundCents: 1_130,
      },
    );

    const amendmentCalls = amendmentUpsert.mock.calls as unknown as Array<
      [{ where: { amendmentStableId: string } }]
    >;
    const firstAmendment = amendmentCalls[0]?.[0];
    const replayedAmendment = amendmentCalls[1]?.[0];
    expect(firstAmendment?.where.amendmentStableId).toMatch(
      /^external_cancel_[0-9a-f]{64}$/,
    );
    expect(replayedAmendment?.where.amendmentStableId).toBe(
      firstAmendment?.where.amendmentStableId,
    );
    expect(lifecycleCreateMany).toHaveBeenCalledTimes(4);
  });

  it('rejects a confirmed external cancellation without authoritative occurrence time', async () => {
    const amendmentUpsert = jest.fn();
    const orderUpdate = jest.fn();
    const opsEventCreateMany = jest.fn();
    const tx = {
      order: {
        findFirst: jest.fn().mockResolvedValue({
          id: '8a3d4c0e-4750-4f6a-9138-000000000404',
          orderStableId: 'stable-order-1',
          storeId: '4750_Yonge_Street',
          channel: 'ubereats',
          paymentMethod: 'UBEREATS',
          subtotalCents: 1_000,
          subtotalAfterDiscountCents: 1_000,
          taxCents: 130,
          deliveryFeeCents: 0,
          creditCardSurchargeCents: 0,
          totalCents: 1_130,
          paymentTotalCents: 1_130,
          items: [],
        }),
        update: orderUpdate,
      },
      orderAmendment: { upsert: amendmentUpsert },
      opsEvent: { createMany: opsEventCreateMany },
    };
    const service = serviceWithTransaction(tx);

    await expect(
      service.finalizeConfirmedCancellation({ ...input, occurredAt: null }),
    ).rejects.toThrow(
      'External cancellation is missing authoritative occurredAt: uber-event-1',
    );
    expect(amendmentUpsert).not.toHaveBeenCalled();
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(opsEventCreateMany).not.toHaveBeenCalled();
  });

  it('rejects a mismatched stable/external identity before canonical writes', async () => {
    const amendmentUpsert = jest.fn();
    const orderUpdate = jest.fn();
    const lifecycleCreateMany = jest.fn();
    const tx = {
      order: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: orderUpdate,
      },
      orderAmendment: { upsert: amendmentUpsert },
      opsEvent: { createMany: lifecycleCreateMany },
    };
    const service = serviceWithTransaction(tx);

    await expect(service.finalizeConfirmedCancellation(input)).rejects.toThrow(
      'External order disappeared before cancellation: uber-order-1',
    );
    expect(amendmentUpsert).not.toHaveBeenCalled();
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(lifecycleCreateMany).not.toHaveBeenCalled();
  });

  it('propagates lifecycle persistence failure so the transaction can roll back', async () => {
    const tx = {
      order: {
        findFirst: jest.fn().mockResolvedValue({
          id: '8a3d4c0e-4750-4f6a-9138-000000000403',
          orderStableId: 'stable-order-1',
          storeId: '4750_Yonge_Street',
          channel: 'ubereats',
          paymentMethod: 'UBEREATS',
          subtotalCents: 1_000,
          subtotalAfterDiscountCents: 1_000,
          taxCents: 130,
          deliveryFeeCents: 0,
          creditCardSurchargeCents: 0,
          totalCents: 1_130,
          paymentTotalCents: 1_130,
          items: [],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      orderAmendment: { upsert: jest.fn().mockResolvedValue({}) },
      opsEvent: {
        createMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockRejectedValueOnce(new Error('lifecycle store unavailable')),
      },
    };
    const service = serviceWithTransaction(tx);

    await expect(service.finalizeConfirmedCancellation(input)).rejects.toThrow(
      'lifecycle store unavailable',
    );
  });
});
