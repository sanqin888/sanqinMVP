import { OrderDeliveryDispatchJournalService } from './order-delivery-dispatch-journal.service';

type CreateManyArgs = {
  data: unknown;
  skipDuplicates?: boolean;
};

describe('OrderDeliveryDispatchJournalService', () => {
  it('binds the provider delivery id and records SUCCEEDED in the same transaction', async () => {
    const createMany = jest
      .fn<Promise<{ count: number }>, [CreateManyArgs]>()
      .mockResolvedValue({ count: 1 });
    const tx = {
      order: {
        findUnique: jest
          .fn<
            Promise<{ externalDeliveryId: string | null } | null>,
            [unknown]
          >()
          .mockResolvedValueOnce({ externalDeliveryId: null }),
        updateMany: jest
          .fn<Promise<{ count: number }>, [unknown]>()
          .mockResolvedValue({ count: 1 }),
      },
      opsEvent: { createMany },
    };
    const transaction = jest.fn(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    const service = new OrderDeliveryDispatchJournalService({
      $transaction: transaction,
    } as never);

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
    const persisted = createMany.mock.calls[0]?.[0];
    expect(persisted?.skipDuplicates).toBe(true);
    expect(JSON.stringify(persisted?.data)).toContain(
      'order.delivery_dispatch.succeeded:order_stable_1:1',
    );
    expect(JSON.stringify(persisted?.data)).toContain('uber-delivery-1');
  });

  it('records FAILED and the next safe retry request atomically in one transaction', async () => {
    const createMany = jest
      .fn<Promise<{ count: number }>, [CreateManyArgs]>()
      .mockResolvedValue({ count: 2 });
    const tx = { opsEvent: { createMany } };
    const transaction = jest.fn(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    const service = new OrderDeliveryDispatchJournalService({
      $transaction: transaction,
    } as never);
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

    expect(transaction).toHaveBeenCalledTimes(1);
    const persisted = createMany.mock.calls[0]?.[0];
    const json = JSON.stringify(persisted?.data);
    expect(persisted?.skipDuplicates).toBe(true);
    expect(json).toContain('order.delivery_dispatch.failed:order_stable_1:1');
    expect(json).toContain(
      'order.delivery_dispatch.requested:order_stable_1:2',
    );
    expect(json).toContain('"trigger":"AUTO_SAFE_RETRY"');
    expect(json).toContain('"automaticRetriesRemaining":2');
    expect(json).toContain(`"notBefore":"${notBefore.toISOString()}"`);
  });

  it('fails closed to UNKNOWN rather than overwriting a different existing provider delivery id', async () => {
    const createMany = jest
      .fn<Promise<{ count: number }>, [CreateManyArgs]>()
      .mockResolvedValue({ count: 1 });
    const tx = {
      order: {
        findUnique: jest
          .fn<
            Promise<{ externalDeliveryId: string | null } | null>,
            [unknown]
          >()
          .mockResolvedValue({ externalDeliveryId: 'uber-existing' }),
        updateMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
      },
      opsEvent: { createMany },
    };
    const transaction = jest.fn(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    const service = new OrderDeliveryDispatchJournalService({
      $transaction: transaction,
    } as never);

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
    const persisted = createMany.mock.calls[0]?.[0];
    const json = JSON.stringify(persisted?.data);
    expect(json).toContain('order.delivery_dispatch.unknown:order_stable_1:1');
    expect(json).toContain('"reason":"LOCAL_BIND_CONFLICT"');
    expect(json).toContain('"providerDeliveryId":"uber-new"');
    expect(json).toContain('"existingProviderDeliveryId":"uber-existing"');
  });
});
