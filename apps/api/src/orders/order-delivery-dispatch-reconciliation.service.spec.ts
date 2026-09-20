import { OrderDeliveryDispatchReconciliationService } from './order-delivery-dispatch-reconciliation.service';

function unknownRow() {
  return {
    eventName: 'order.delivery_dispatch.unknown',
    payload: {
      orderStableId: 'order_stable_1',
      attempt: 1,
      reason: 'PROVIDER_OUTCOME_UNKNOWN',
      errorMessage: 'timeout',
    },
    createdAt: new Date('2026-09-19T20:01:00.000Z'),
  };
}

describe('OrderDeliveryDispatchReconciliationService', () => {

  it('queries unresolved operator-actionable FAILED / UNKNOWN attempts without a fixed recent-event window', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      {
        orderStableId: 'order_stable_1',
        orderNumber: 'WEB-1001',
        attempt: 1,
        state: 'UNKNOWN',
        orderStatus: 'paid',
        externalDeliveryId: null,
        reason: 'PROVIDER_OUTCOME_UNKNOWN',
        errorMessage: 'timeout',
        providerDeliveryId: null,
        failureHistory: null,
        contactName: 'Jane Doe',
        contactPhone: '+14165550123',
        metadataJson: {
          customer: {
            firstName: 'Jane',
            lastName: 'Doe',
            phone: '+14165550123',
            addressLine1: '100 King St W',
            city: 'Toronto',
            province: 'ON',
            postalCode: 'M5X 1A9',
            notes: 'Buzz 1201',
          },
        },
        eventAt: new Date('2026-09-19T20:01:00.000Z'),
      },
    ]);
    const service = new OrderDeliveryDispatchReconciliationService(
      { $queryRaw: queryRaw } as never,
    );

    await expect(service.listQueue()).resolves.toEqual([
      {
        orderStableId: 'order_stable_1',
        orderNumber: 'WEB-1001',
        attempt: 1,
        state: 'UNKNOWN',
        requiresAction: true,
        orderStatus: 'paid',
        externalDeliveryId: null,
        reason: 'PROVIDER_OUTCOME_UNKNOWN',
        errorMessage: 'timeout',
        providerDeliveryId: null,
        failureHistory: [],
        deliveryDestination: {
          name: 'Jane Doe',
          phone: '+14165550123',
          addressLine1: '100 King St W',
          addressLine2: null,
          city: 'Toronto',
          province: 'ON',
          postalCode: 'M5X 1A9',
          country: 'Canada',
          instructions: 'Buzz 1201',
        },
        eventAt: '2026-09-19T20:01:00.000Z',
      },
    ]);

    const sql = Array.isArray(queryRaw.mock.calls[0]?.[0])
      ? (queryRaw.mock.calls[0][0] as unknown[]).join(' ')
      : String(queryRaw.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('LOCAL_VALIDATION_FAILED');
    expect(sql).toContain('PROVIDER_REJECTED');
    expect(sql).not.toContain('LIMIT 1000');
  });

  it('binds a provider delivery only after explicit operator reconciliation', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'order-db-1' }]),
      opsEvent: {
        findMany: jest.fn().mockResolvedValue([unknownRow()]),
        createMany,
      },
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-db-1',
          orderStableId: 'order_stable_1',
          clientRequestId: 'WEB-1001',
          status: 'paid',
          fulfillmentType: 'delivery',
          deliveryProvider: 'UBER',
          externalDeliveryId: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new OrderDeliveryDispatchReconciliationService(
      prisma as never,
    );

    await expect(
      service.reconcile({
        orderStableId: 'order_stable_1',
        attempt: 1,
        action: 'BIND_EXISTING',
        operatorUserStableId: 'admin-1',
        providerDeliveryId: 'uber-delivery-1',
        note: 'confirmed in Uber dashboard',
      }),
    ).resolves.toMatchObject({
      action: 'BIND_EXISTING',
      externalDeliveryId: 'uber-delivery-1',
    });

    const lockSql = Array.isArray(tx.$queryRaw.mock.calls[0]?.[0])
      ? (tx.$queryRaw.mock.calls[0][0] as unknown[]).join(' ')
      : String(tx.$queryRaw.mock.calls[0]?.[0] ?? '');
    expect(lockSql).toContain('FOR UPDATE');
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-db-1' },
      data: { externalDeliveryId: 'uber-delivery-1' },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idempotencyKey:
          'order.delivery_dispatch.reconciled:order_stable_1:1',
        eventName: 'order.delivery_dispatch.reconciled',
        payload: expect.objectContaining({
          action: 'BIND_EXISTING',
          operatorUserStableId: 'admin-1',
          providerDeliveryId: 'uber-delivery-1',
        }),
      }),
      skipDuplicates: true,
    });
  });

  it('creates the next durable attempt only after an operator confirms that Uber did not create the prior delivery', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'order-db-1' }]),
      opsEvent: {
        findMany: jest.fn().mockResolvedValue([unknownRow()]),
        createMany,
      },
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-db-1',
          orderStableId: 'order_stable_1',
          clientRequestId: 'WEB-1001',
          status: 'making',
          fulfillmentType: 'delivery',
          deliveryProvider: 'UBER',
          externalDeliveryId: null,
        }),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new OrderDeliveryDispatchReconciliationService(
      prisma as never,
    );

    await expect(
      service.reconcile({
        orderStableId: 'order_stable_1',
        attempt: 1,
        action: 'CONFIRM_NOT_CREATED_RETRY',
        operatorUserStableId: 'admin-1',
        note: 'confirmed absent in provider dashboard',
      }),
    ).resolves.toEqual({
      orderStableId: 'order_stable_1',
      attempt: 1,
      action: 'CONFIRM_NOT_CREATED_RETRY',
      nextAttempt: 2,
    });

    expect(tx.order.update).not.toHaveBeenCalled();
    expect(createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          idempotencyKey:
            'order.delivery_dispatch.reconciled:order_stable_1:1',
          eventName: 'order.delivery_dispatch.reconciled',
        }),
        expect.objectContaining({
          idempotencyKey:
            'order.delivery_dispatch.requested:order_stable_1:2',
          eventName: 'order.delivery_dispatch.requested',
          payload: expect.objectContaining({
            attempt: 2,
            trigger: 'OPERATOR_CONFIRMED_NOT_CREATED',
            authorizedByUserStableId: 'admin-1',
            automaticRetriesRemaining: 3,
          }),
        }),
      ]),
      skipDuplicates: true,
    });
  });

  it('rejects a stale reconciliation request instead of creating a duplicate retry', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'order-db-1' }]),
      opsEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            ...unknownRow(),
            payload: {
              ...unknownRow().payload,
              attempt: 2,
            },
          },
        ]),
        createMany: jest.fn(),
      },
      order: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new OrderDeliveryDispatchReconciliationService(
      prisma as never,
    );

    await expect(
      service.reconcile({
        orderStableId: 'order_stable_1',
        attempt: 1,
        action: 'CONFIRM_NOT_CREATED_RETRY',
        operatorUserStableId: 'admin-1',
      }),
    ).rejects.toMatchObject({
      code: 'STALE_ATTEMPT',
    });

    expect(tx.order.findUnique).not.toHaveBeenCalled();
    expect(tx.opsEvent.createMany).not.toHaveBeenCalled();
  });
});
