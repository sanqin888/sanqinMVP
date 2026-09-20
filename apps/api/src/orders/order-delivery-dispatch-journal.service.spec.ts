import { OrderDeliveryDispatchJournalService } from './order-delivery-dispatch-journal.service';

describe('OrderDeliveryDispatchJournalService', () => {
  it('binds the provider delivery id and records SUCCEEDED in the same transaction', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ externalDeliveryId: null }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      opsEvent: { createMany },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new OrderDeliveryDispatchJournalService(prisma as never);

    await expect(
      service.persistProviderSuccess({
        orderDbId: 'order-db-1',
        orderStableId: 'order_stable_1',
        attempt: 1,
        externalReference: 'WEB-1001',
        response: {
          deliveryId: 'uber-delivery-1',
          externalDeliveryId: 'WEB-1001',
          status: 'pending',
        },
      }),
    ).resolves.toBe('SUCCEEDED');

    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'order-db-1',
        externalDeliveryId: null,
      },
      data: { externalDeliveryId: 'uber-delivery-1' },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idempotencyKey:
          'order.delivery_dispatch.succeeded:order_stable_1:1',
        eventName: 'order.delivery_dispatch.succeeded',
        source: 'orders.delivery_dispatch',
        payload: expect.objectContaining({
          providerDeliveryId: 'uber-delivery-1',
        }),
      }),
      skipDuplicates: true,
    });
  });


  it('records FAILED and the next safe retry request atomically in one transaction', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const tx = { opsEvent: { createMany } };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new OrderDeliveryDispatchJournalService(prisma as never);
    const notBefore = new Date('2026-09-19T20:00:02.000Z');

    await service.recordFailedAndScheduleAutomaticRetry({
      orderStableId: 'order_stable_1',
      attempt: 1,
      externalReference: 'WEB-1001',
      reason: 'PROVIDER_REJECTED',
      errorMessage: 'Uber Direct API error (429): rate limited',
      statusCode: 429,
      nextAttempt: 2,
      automaticRetriesRemaining: 2,
      notBefore,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          idempotencyKey:
            'order.delivery_dispatch.failed:order_stable_1:1',
          eventName: 'order.delivery_dispatch.failed',
          payload: expect.objectContaining({
            attempt: 1,
            statusCode: 429,
          }),
        }),
        expect.objectContaining({
          idempotencyKey:
            'order.delivery_dispatch.requested:order_stable_1:2',
          eventName: 'order.delivery_dispatch.requested',
          payload: expect.objectContaining({
            attempt: 2,
            trigger: 'AUTO_SAFE_RETRY',
            automaticRetriesRemaining: 2,
            previousAttempt: 1,
            notBefore: notBefore.toISOString(),
          }),
        }),
      ]),
      skipDuplicates: true,
    });
  });

  it('fails closed to UNKNOWN rather than overwriting a different existing provider delivery id', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ externalDeliveryId: 'uber-existing' }),
        updateMany: jest.fn(),
      },
      opsEvent: { createMany },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new OrderDeliveryDispatchJournalService(prisma as never);

    await expect(
      service.persistProviderSuccess({
        orderDbId: 'order-db-1',
        orderStableId: 'order_stable_1',
        attempt: 1,
        externalReference: 'WEB-1001',
        response: {
          deliveryId: 'uber-new',
          externalDeliveryId: 'WEB-1001',
        },
      }),
    ).resolves.toBe('UNKNOWN');

    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(createMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idempotencyKey: 'order.delivery_dispatch.unknown:order_stable_1:1',
        eventName: 'order.delivery_dispatch.unknown',
        payload: expect.objectContaining({
          reason: 'LOCAL_BIND_CONFLICT',
          providerDeliveryId: 'uber-new',
          existingProviderDeliveryId: 'uber-existing',
        }),
      }),
      skipDuplicates: true,
    });
  });
});
