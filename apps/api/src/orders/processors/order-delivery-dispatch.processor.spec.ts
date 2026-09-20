import { OrderDeliveryDispatchProcessor } from './order-delivery-dispatch.processor';

const ORIGINAL_ENV = process.env;

describe('OrderDeliveryDispatchProcessor durable queue', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      UBER_DIRECT_DURABLE_STALE_ATTEMPT_MS: '120000',
    };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  it('seeds a durable request, claims it with an attempt_started fact, then dispatches exactly that attempt', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          orderStableId: 'order_stable_1',
          attempt: 1,
          automaticRetriesRemaining: 3,
        },
      ]);
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: queryRaw,
      opsEvent: { createMany },
    };
    const prisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([
          {
            orderStableId: 'order_stable_1',
            clientRequestId: 'WEB-1001',
          },
        ]),
      },
      opsEvent: { createMany },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const handleDurableAttempt = jest.fn().mockResolvedValue(undefined);
    const processor = new OrderDeliveryDispatchProcessor(
      prisma as never,
      { handleDurableAttempt } as never,
    );

    await expect(processor.processOnce(1)).resolves.toBe(1);

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          externalDeliveryId: null,
        }),
      }),
    );
    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            idempotencyKey:
              'order.delivery_dispatch.requested:order_stable_1:1',
            eventName: 'order.delivery_dispatch.requested',
            source: 'orders.delivery_dispatch',
            payload: expect.objectContaining({
              automaticRetriesRemaining: 3,
            }),
          }),
        ]),
        skipDuplicates: true,
      }),
    );
    expect(createMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idempotencyKey:
          'order.delivery_dispatch.attempt_started:order_stable_1:1',
        eventName: 'order.delivery_dispatch.attempt_started',
      }),
      skipDuplicates: true,
    });
    expect(handleDurableAttempt).toHaveBeenCalledTimes(1);
    expect(handleDurableAttempt).toHaveBeenCalledWith({
      orderStableId: 'order_stable_1',
      attempt: 1,
      automaticRetriesRemaining: 3,
    });
  });

  it('converts a stale started attempt to UNKNOWN and never re-posts it automatically', async () => {
    const queryRaw = jest.fn().mockResolvedValueOnce([
      {
        orderStableId: 'order_stable_2',
        attempt: 1,
        externalReference: 'WEB-1002',
      },
    ]);
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: queryRaw,
      opsEvent: { createMany },
    };
    const prisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest
          .fn()
          .mockResolvedValue({ clientRequestId: 'WEB-1002' }),
      },
      opsEvent: { createMany },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const handleDurableAttempt = jest.fn();
    const notifyReconciliationRequired = jest.fn().mockResolvedValue(undefined);
    const processor = new OrderDeliveryDispatchProcessor(
      prisma as never,
      { handleDurableAttempt, notifyReconciliationRequired } as never,
    );

    await expect(processor.processOnce(1)).resolves.toBe(1);

    expect(createMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idempotencyKey: 'order.delivery_dispatch.unknown:order_stable_2:1',
        eventName: 'order.delivery_dispatch.unknown',
        payload: expect.objectContaining({
          reason: 'PROCESS_INTERRUPTED_AFTER_ATTEMPT_STARTED',
        }),
      }),
      skipDuplicates: true,
    });
    expect(handleDurableAttempt).not.toHaveBeenCalled();
    expect(notifyReconciliationRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        orderStableId: 'order_stable_2',
        orderNumber: 'WEB-1002',
        attempt: 1,
        reason: 'PROCESS_INTERRUPTED_AFTER_ATTEMPT_STARTED',
        failureHistory: [
          expect.objectContaining({
            attempt: 1,
            reason: 'PROCESS_INTERRUPTED_AFTER_ATTEMPT_STARTED',
          }),
        ],
      }),
    );
  });
});
