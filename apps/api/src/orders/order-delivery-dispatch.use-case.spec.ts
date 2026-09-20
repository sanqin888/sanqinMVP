import { UberDirectDeliveryDispatchError } from '../deliveries/public-api';
import { OrderDeliveryDispatchUseCase } from './order-delivery-dispatch.use-case';

function deliveryOrder() {
  return {
    id: 'order-db-1',
    orderStableId: 'order_stable_1',
    clientRequestId: 'WEB-1001',
    pickupCode: 'A100',
    fulfillmentType: 'delivery',
    deliveryProvider: 'UBER',
    externalDeliveryId: null,
    status: 'paid',
    totalCents: 2599,
    paidAt: new Date('2026-09-19T20:00:00.000Z'),
    contactName: 'Jane Doe',
    contactPhone: '+14165550123',
    items: [
      {
        displayName: 'Roujiamo',
        productStableId: 'roujiamo',
        qty: 2,
        unitPriceCents: 999,
      },
    ],
  };
}

function checkoutMetadata() {
  return {
    customer: {
      firstName: 'Jane',
      lastName: 'Doe',
      phone: '+14165550123',
      addressLine1: '100 King St W',
      city: 'Toronto',
      province: 'ON',
      postalCode: 'M5X 1A9',
    },
    prepMinutes: 10,
  };
}

describe('OrderDeliveryDispatchUseCase durable dispatch', () => {
  function setup(createDelivery: jest.Mock) {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue(deliveryOrder()),
      },
      checkoutIntent: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ metadataJson: checkoutMetadata() }),
      },
    };
    const dispatchJournal = {
      recordFailed: jest.fn().mockResolvedValue(undefined),
      recordUnknown: jest.fn().mockResolvedValue(undefined),
      recordSucceeded: jest.fn().mockResolvedValue(undefined),
      persistProviderSuccess: jest.fn().mockResolvedValue('SUCCEEDED'),
      recordFailedAndScheduleAutomaticRetry: jest
        .fn()
        .mockResolvedValue(undefined),
      listFailureHistory: jest.fn().mockResolvedValue([]),
    };
    const listActiveAdminRecipients = jest.fn().mockResolvedValue([
      {
        userStableId: 'admin-1',
        email: 'admin@example.com',
        phone: null,
        language: 'EN',
      },
    ]);
    const notifyDeliveryDispatchFailed = jest
      .fn()
      .mockResolvedValue({ ok: true, sentCount: 1, failedCount: 0 });

    const service = new OrderDeliveryDispatchUseCase(
      prisma as never,
      dispatchJournal as never,
      { createDelivery } as never,
      { listActiveAdminRecipients } as never,
      { notifyDeliveryDispatchFailed } as never,
    );

    return {
      service,
      prisma,
      dispatchJournal,
      notifyDeliveryDispatchFailed,
    };
  }

  it('records UNKNOWN, does not blindly retry, and reuses the admin delivery alert path for reconciliation', async () => {
    const createDelivery = jest.fn().mockRejectedValue(
      new UberDirectDeliveryDispatchError(
        'timeout of 20000ms exceeded',
        'UNKNOWN',
      ),
    );
    const { service, dispatchJournal, notifyDeliveryDispatchFailed } =
      setup(createDelivery);

    await service.handleDurableAttempt({
      orderStableId: 'order_stable_1',
      attempt: 1,
      automaticRetriesRemaining: 3,
    });

    expect(createDelivery).toHaveBeenCalledTimes(1);
    expect(dispatchJournal.recordUnknown).toHaveBeenCalledWith(
      expect.objectContaining({
        orderStableId: 'order_stable_1',
        attempt: 1,
        reason: 'PROVIDER_OUTCOME_UNKNOWN',
      }),
    );
    expect(dispatchJournal.recordFailed).not.toHaveBeenCalled();
    expect(
      dispatchJournal.recordFailedAndScheduleAutomaticRetry,
    ).not.toHaveBeenCalled();
    expect(notifyDeliveryDispatchFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        orderNumber: 'WEB-1001',
        deliveryProvider: 'Uber Direct',
        errorMessage: expect.stringContaining('Provider outcome is UNKNOWN'),
        orderDetailUrl:
          'https://sanq.ca/zh/admin/delivery-dispatch?order=order_stable_1',
      }),
    );
  });

  it('schedules a safe automatic retry without alerting Admin while retry allowance remains', async () => {
    const createDelivery = jest.fn().mockRejectedValue(
      new UberDirectDeliveryDispatchError(
        'Uber Direct API error (400): invalid request',
        'SAFE_TO_RETRY',
        400,
      ),
    );
    const { service, dispatchJournal, notifyDeliveryDispatchFailed } =
      setup(createDelivery);

    await service.handleDurableAttempt({
      orderStableId: 'order_stable_1',
      attempt: 1,
      automaticRetriesRemaining: 3,
    });

    expect(dispatchJournal.recordFailed).not.toHaveBeenCalled();
    expect(
      dispatchJournal.recordFailedAndScheduleAutomaticRetry,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        orderStableId: 'order_stable_1',
        attempt: 1,
        nextAttempt: 2,
        externalReference: 'WEB-1001',
        automaticRetriesRemaining: 2,
        notBefore: expect.any(Date),
      }),
    );
    expect(dispatchJournal.recordUnknown).not.toHaveBeenCalled();
    expect(notifyDeliveryDispatchFailed).not.toHaveBeenCalled();
  });

  it('alerts Admin with the complete failure history only after three automatic retries are exhausted', async () => {
    const createDelivery = jest.fn().mockRejectedValue(
      new UberDirectDeliveryDispatchError(
        'Uber Direct API error (400): invalid request',
        'SAFE_TO_RETRY',
        400,
      ),
    );
    const { service, dispatchJournal, notifyDeliveryDispatchFailed } =
      setup(createDelivery);
    dispatchJournal.listFailureHistory.mockResolvedValue([
      {
        attempt: 1,
        reason: 'PROVIDER_REJECTED',
        errorMessage: 'attempt one rejected',
        statusCode: 400,
      },
      {
        attempt: 2,
        reason: 'PROVIDER_REJECTED',
        errorMessage: 'attempt two rejected',
        statusCode: 400,
      },
      {
        attempt: 3,
        reason: 'PROVIDER_REJECTED',
        errorMessage: 'attempt three rejected',
        statusCode: 400,
      },
    ]);

    await service.handleDurableAttempt({
      orderStableId: 'order_stable_1',
      attempt: 4,
      automaticRetriesRemaining: 0,
    });

    expect(
      dispatchJournal.recordFailedAndScheduleAutomaticRetry,
    ).not.toHaveBeenCalled();
    expect(dispatchJournal.listFailureHistory).toHaveBeenCalledWith(
      'order_stable_1',
      1,
    );
    expect(dispatchJournal.recordFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        orderStableId: 'order_stable_1',
        attempt: 4,
        reason: 'PROVIDER_REJECTED',
        failureHistory: expect.arrayContaining([
          expect.objectContaining({ attempt: 1 }),
          expect.objectContaining({ attempt: 2 }),
          expect.objectContaining({ attempt: 3 }),
          expect.objectContaining({ attempt: 4 }),
        ]),
      }),
    );
    expect(notifyDeliveryDispatchFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        orderNumber: 'WEB-1001',
        errorMessage: expect.stringContaining('Automatic retries exhausted'),
        orderDetailUrl:
          'https://sanq.ca/zh/admin/delivery-dispatch?order=order_stable_1',
      }),
    );
  });

  it('persists provider success through the durable journal transaction', async () => {
    const createDelivery = jest.fn().mockResolvedValue({
      deliveryId: 'uber-delivery-1',
      externalDeliveryId: 'WEB-1001',
      status: 'pending',
    });
    const { service, dispatchJournal } = setup(createDelivery);

    await service.handleDurableAttempt({
      orderStableId: 'order_stable_1',
      attempt: 1,
      automaticRetriesRemaining: 3,
    });

    expect(dispatchJournal.persistProviderSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        orderDbId: 'order-db-1',
        orderStableId: 'order_stable_1',
        attempt: 1,
        externalReference: 'WEB-1001',
        response: expect.objectContaining({
          deliveryId: 'uber-delivery-1',
        }),
      }),
    );
    expect(dispatchJournal.recordUnknown).not.toHaveBeenCalled();
    expect(dispatchJournal.recordFailed).not.toHaveBeenCalled();
  });

  it('does not create another provider delivery when the Order is already bound', async () => {
    const createDelivery = jest.fn();
    const { service, prisma, dispatchJournal } = setup(createDelivery);
    prisma.order.findUnique.mockResolvedValue({
      ...deliveryOrder(),
      externalDeliveryId: 'uber-delivery-existing',
    });

    await service.handleDurableAttempt({
      orderStableId: 'order_stable_1',
      attempt: 1,
      automaticRetriesRemaining: 3,
    });

    expect(createDelivery).not.toHaveBeenCalled();
    expect(dispatchJournal.recordSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({
        providerDeliveryId: 'uber-delivery-existing',
        reason: 'ALREADY_BOUND',
      }),
    );
  });
});
