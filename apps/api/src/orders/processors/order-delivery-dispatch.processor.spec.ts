import { OrderDeliveryDispatchProcessor } from './order-delivery-dispatch.processor';

const ORIGINAL_ENV = process.env;

type QueryRawMock = jest.Mock<
  Promise<unknown[]>,
  [TemplateStringsArray, ...unknown[]]
>;

type CreateManyArgs = {
  data: unknown;
  skipDuplicates?: boolean;
};

function queryRawMock(): QueryRawMock {
  return jest.fn<Promise<unknown[]>, [TemplateStringsArray, ...unknown[]]>();
}

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
    const queryRaw = queryRawMock()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          orderStableId: 'order_stable_1',
          attempt: 1,
          automaticRetriesRemaining: 3,
        },
      ]);
    const createMany = jest
      .fn<Promise<{ count: number }>, [CreateManyArgs]>()
      .mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: queryRaw,
      opsEvent: { createMany },
    };
    const findMany = jest
      .fn<
        Promise<
          Array<{ orderStableId: string; clientRequestId: string | null }>
        >,
        [unknown]
      >()
      .mockResolvedValue([
        {
          orderStableId: 'order_stable_1',
          clientRequestId: 'WEB-1001',
        },
      ]);
    const transaction = jest.fn(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    const prisma = {
      order: { findMany },
      opsEvent: { createMany },
      $transaction: transaction,
    };
    const handleDurableAttempt = jest
      .fn<Promise<void>, [Record<string, unknown>]>()
      .mockResolvedValue();
    const processor = new OrderDeliveryDispatchProcessor(
      prisma as never,
      { handleDurableAttempt } as never,
    );

    await expect(processor.processOnce(1)).resolves.toBe(1);

    const findInput = findMany.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(JSON.stringify(findInput)).toContain('"externalDeliveryId":null');

    const persisted = createMany.mock.calls.map((call) => call[0]);
    const persistedJson = JSON.stringify(persisted);
    expect(persistedJson).toContain(
      'order.delivery_dispatch.requested:order_stable_1:1',
    );
    expect(persistedJson).toContain(
      'order.delivery_dispatch.attempt_started:order_stable_1:1',
    );
    expect(persistedJson).toContain('"automaticRetriesRemaining":3');

    expect(handleDurableAttempt).toHaveBeenCalledTimes(1);
    expect(handleDurableAttempt.mock.calls[0]?.[0]).toEqual({
      orderStableId: 'order_stable_1',
      attempt: 1,
      automaticRetriesRemaining: 3,
    });
  });

  it('converts a stale started attempt to UNKNOWN and never re-posts it automatically', async () => {
    const queryRaw = queryRawMock().mockResolvedValueOnce([
      {
        orderStableId: 'order_stable_2',
        attempt: 1,
        externalReference: 'WEB-1002',
      },
    ]);
    const createMany = jest
      .fn<Promise<{ count: number }>, [CreateManyArgs]>()
      .mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: queryRaw,
      opsEvent: { createMany },
    };
    const prisma = {
      order: {
        findMany: jest
          .fn<Promise<unknown[]>, [unknown]>()
          .mockResolvedValue([]),
        findUnique: jest
          .fn<Promise<{ clientRequestId: string } | null>, [unknown]>()
          .mockResolvedValue({ clientRequestId: 'WEB-1002' }),
      },
      opsEvent: { createMany },
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const handleDurableAttempt =
      jest.fn<Promise<void>, [Record<string, unknown>]>();
    const notifyReconciliationRequired = jest
      .fn<Promise<void>, [Record<string, unknown>]>()
      .mockResolvedValue();
    const processor = new OrderDeliveryDispatchProcessor(
      prisma as never,
      { handleDurableAttempt, notifyReconciliationRequired } as never,
    );

    await expect(processor.processOnce(1)).resolves.toBe(1);

    const persistedJson = JSON.stringify(
      createMany.mock.calls.map((call) => call[0]),
    );
    expect(persistedJson).toContain(
      'order.delivery_dispatch.unknown:order_stable_2:1',
    );
    expect(persistedJson).toContain(
      '"reason":"PROCESS_INTERRUPTED_AFTER_ATTEMPT_STARTED"',
    );
    expect(handleDurableAttempt).not.toHaveBeenCalled();

    const notification = notifyReconciliationRequired.mock.calls[0]?.[0];
    expect(notification).toMatchObject({
      orderStableId: 'order_stable_2',
      orderNumber: 'WEB-1002',
      attempt: 1,
      reason: 'PROCESS_INTERRUPTED_AFTER_ATTEMPT_STARTED',
    });
    expect(JSON.stringify(notification?.failureHistory)).toContain(
      'PROCESS_INTERRUPTED_AFTER_ATTEMPT_STARTED',
    );
  });
});
