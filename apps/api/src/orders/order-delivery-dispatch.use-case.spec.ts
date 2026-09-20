import {
  UberDirectDeliveryDispatchError,
  type UberDirectDeliveryDispatcherPort,
} from '../deliveries/public-api';
import type {
  DeliveryDispatchFailureDetail,
} from './order-delivery-dispatch-journal.service';
import { OrderDeliveryDispatchUseCase } from './order-delivery-dispatch.use-case';

function deliveryOrder() {
  return {
    id: 'order-db-1',
    orderStableId: 'order_stable_1',
    clientRequestId: 'WEB-1001',
    pickupCode: 'A100',
    fulfillmentType: 'delivery',
    deliveryProvider: 'UBER',
    externalDeliveryId: null as string | null,
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

type JournalInput = Record<string, unknown>;
type NotificationInput = {
  orderNumber: string;
  deliveryProvider: string;
  errorMessage: string;
  orderDetailUrl: string;
};

describe('OrderDeliveryDispatchUseCase durable dispatch', () => {
  function setup(
    createDelivery: jest.MockedFunction<
      UberDirectDeliveryDispatcherPort['createDelivery']
    >,
  ) {
    const findUnique = jest
      .fn<Promise<ReturnType<typeof deliveryOrder> | null>, [unknown]>()
      .mockResolvedValue(deliveryOrder());
    const prisma = {
      order: { findUnique },
      checkoutIntent: {
        findFirst: jest
          .fn<
            Promise<{ metadataJson: ReturnType<typeof checkoutMetadata> }>,
            [unknown]
          >()
          .mockResolvedValue({ metadataJson: checkoutMetadata() }),
      },
    };
    const recordFailed = jest
      .fn<Promise<void>, [JournalInput]>()
      .mockResolvedValue();
    const recordUnknown = jest
      .fn<Promise<void>, [JournalInput]>()
      .mockResolvedValue();
    const recordSucceeded = jest
      .fn<Promise<void>, [JournalInput]>()
      .mockResolvedValue();
    const persistProviderSuccess = jest
      .fn<Promise<'SUCCEEDED' | 'UNKNOWN'>, [JournalInput]>()
      .mockResolvedValue('SUCCEEDED');
    const recordFailedAndScheduleAutomaticRetry = jest
      .fn<Promise<void>, [JournalInput]>()
      .mockResolvedValue();
    const listFailureHistory = jest
      .fn<Promise<DeliveryDispatchFailureDetail[]>, [string, number?]>()
      .mockResolvedValue([]);
    const dispatchJournal = {
      recordFailed,
      recordUnknown,
      recordSucceeded,
      persistProviderSuccess,
      recordFailedAndScheduleAutomaticRetry,
      listFailureHistory,
    };
    const listActiveAdminRecipients = jest
      .fn<
        Promise<
          Array<{
            userStableId: string;
            email: string;
            phone: string | null;
            language: string;
          }>
        >,
        []
      >()
      .mockResolvedValue([
        {
          userStableId: 'admin-1',
          email: 'admin@example.com',
          phone: null,
          language: 'EN',
        },
      ]);
    const notifyDeliveryDispatchFailed = jest
      .fn<
        Promise<{ ok: boolean; sentCount: number; failedCount: number }>,
        [NotificationInput]
      >()
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
    const createDelivery =
      jest.fn<UberDirectDeliveryDispatcherPort['createDelivery']>();
    createDelivery.mockRejectedValue(
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
    expect(dispatchJournal.recordUnknown.mock.calls[0]?.[0]).toMatchObject({
      orderStableId: 'order_stable_1',
      attempt: 1,
      reason: 'PROVIDER_OUTCOME_UNKNOWN',
    });
    expect(dispatchJournal.recordFailed).not.toHaveBeenCalled();
    expect(
      dispatchJournal.recordFailedAndScheduleAutomaticRetry,
    ).not.toHaveBeenCalled();

    const notification = notifyDeliveryDispatchFailed.mock.calls[0]?.[0];
    expect(notification).toMatchObject({
      orderNumber: 'WEB-1001',
      deliveryProvider: 'Uber Direct',
      orderDetailUrl:
        'https://sanq.ca/zh/admin/delivery-dispatch?order=order_stable_1',
    });
    expect(notification?.errorMessage).toContain('Provider outcome is UNKNOWN');
  });

  it('schedules a safe automatic retry without alerting Admin while retry allowance remains', async () => {
    const createDelivery =
      jest.fn<UberDirectDeliveryDispatcherPort['createDelivery']>();
    createDelivery.mockRejectedValue(
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
    const retry =
      dispatchJournal.recordFailedAndScheduleAutomaticRetry.mock.calls[0]?.[0];
    expect(retry).toMatchObject({
      orderStableId: 'order_stable_1',
      attempt: 1,
      nextAttempt: 2,
      externalReference: 'WEB-1001',
      automaticRetriesRemaining: 2,
      statusCode: 400,
    });
    expect(retry?.notBefore).toBeInstanceOf(Date);
    expect(dispatchJournal.recordUnknown).not.toHaveBeenCalled();
    expect(notifyDeliveryDispatchFailed).not.toHaveBeenCalled();
  });

  it('alerts Admin with the complete failure history only after three automatic retries are exhausted', async () => {
    const createDelivery =
      jest.fn<UberDirectDeliveryDispatcherPort['createDelivery']>();
    createDelivery.mockRejectedValue(
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
    const failed = dispatchJournal.recordFailed.mock.calls[0]?.[0];
    expect(failed).toMatchObject({
      orderStableId: 'order_stable_1',
      attempt: 4,
      reason: 'PROVIDER_REJECTED',
    });
    expect(JSON.stringify(failed?.failureHistory)).toContain('"attempt":1');
    expect(JSON.stringify(failed?.failureHistory)).toContain('"attempt":4');

    const notification = notifyDeliveryDispatchFailed.mock.calls[0]?.[0];
    expect(notification?.errorMessage).toContain('Automatic retries exhausted');
    expect(notification?.errorMessage).toContain('Attempt 1');
    expect(notification?.errorMessage).toContain('Attempt 4');
  });

  it('persists provider success through the durable journal transaction', async () => {
    const createDelivery =
      jest.fn<UberDirectDeliveryDispatcherPort['createDelivery']>();
    createDelivery.mockResolvedValue({
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

    expect(
      dispatchJournal.persistProviderSuccess.mock.calls[0]?.[0],
    ).toMatchObject({
      orderDbId: 'order-db-1',
      orderStableId: 'order_stable_1',
      attempt: 1,
      externalReference: 'WEB-1001',
    });
    const persistedSuccess =
      dispatchJournal.persistProviderSuccess.mock.calls[0]?.[0];
    expect(JSON.stringify(persistedSuccess?.response)).toContain(
      'uber-delivery-1',
    );
    expect(dispatchJournal.recordUnknown).not.toHaveBeenCalled();
    expect(dispatchJournal.recordFailed).not.toHaveBeenCalled();
  });

  it('does not create another provider delivery when the Order is already bound', async () => {
    const createDelivery =
      jest.fn<UberDirectDeliveryDispatcherPort['createDelivery']>();
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
    expect(dispatchJournal.recordSucceeded.mock.calls[0]?.[0]).toMatchObject({
      providerDeliveryId: 'uber-delivery-existing',
      reason: 'ALREADY_BOUND',
    });
  });
});
