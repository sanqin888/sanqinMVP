import { UberOrderActionPrismaAdapter } from './uber-order-action-prisma.adapter';

const claimedRow = (id: string) => ({
  id,
  leaseToken: `worker:lease:${id}`,
  externalOrderId: `order-${id}`,
  action: 'ACCEPT' as const,
  idempotencyKey: `key-${id}`,
  businessVersion: 'v1',
  reasonCode: null,
  reasonDetail: null,
});

type RawTag = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;

const sqlText = (strings: TemplateStringsArray) => strings.join('?');

const intent = {
  externalOrderId: 'order-1',
  action: 'ACCEPT' as const,
  idempotencyKey: 'key-1',
  businessVersion: 'v1',
  reasonCode: null,
  reasonDetail: null,
};

describe('UberOrderActionPrismaAdapter contract', () => {
  it.each(['ACCEPT', 'DENY', 'CANCEL', 'READY_FOR_PICKUP'] as const)(
    'enqueues %s as a durable command',
    async (action) => {
      const create = jest.fn().mockResolvedValue({ id: `task-${action}` });
      const adapter = new UberOrderActionPrismaAdapter({
        uberOrderAction: { create },
      } as never);

      await expect(adapter.enqueue({ ...intent, action })).resolves.toEqual({
        taskId: `task-${action}`,
        created: true,
      });
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action,
            status: 'PENDING',
          }) as unknown,
          select: { id: true },
        }),
      );
    },
  );

  it('returns the existing task after a duplicate enqueue race', async () => {
    const adapter = new UberOrderActionPrismaAdapter({
      uberOrderAction: {
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'existing-task' }),
      },
    } as never);
    await expect(adapter.enqueue(intent)).resolves.toEqual({
      taskId: 'existing-task',
      created: false,
    });
  });

  it('claims work with one SKIP LOCKED update so workers do not duplicate work', async () => {
    const queryRaw = jest
      .fn<ReturnType<RawTag>, Parameters<RawTag>>()
      .mockResolvedValueOnce([claimedRow('a')])
      .mockResolvedValueOnce([claimedRow('b')]);
    const adapter = new UberOrderActionPrismaAdapter({
      $queryRaw: queryRaw,
    } as never);
    const input = { limit: 1, now: new Date(0), leaseDurationMs: 30_000 };

    const [first, second] = await Promise.all([
      adapter.claim({ ...input, owner: 'worker-a' }),
      adapter.claim({ ...input, owner: 'worker-b' }),
    ]);

    expect(first.map(({ taskId }) => taskId)).toEqual(['a']);
    expect(second.map(({ taskId }) => taskId)).toEqual(['b']);
    const statement = sqlText(queryRaw.mock.calls[0][0]);
    expect(statement).toContain('FOR UPDATE SKIP LOCKED');
    expect(statement).toContain('UPDATE "UberOrderAction"');
  });

  it('reads fulfillment timing and scheduled target with the local order context', async () => {
    const scheduledReadyAt = new Date('2026-08-19T22:30:00.000Z');
    const adapter = new UberOrderActionPrismaAdapter({
      order: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'pending',
          totalCents: 2_500,
          paidAt: null,
          createdAt: new Date('2026-08-19T20:00:00.000Z'),
          fulfillmentTiming: 'SCHEDULED',
          scheduledReadyAt,
        }),
      },
    } as never);

    await expect(adapter.getOrderContext('order-1')).resolves.toEqual({
      status: 'pending',
      totalCents: 2_500,
      referenceAt: new Date('2026-08-19T20:00:00.000Z'),
      fulfillmentTiming: 'SCHEDULED',
      scheduledReadyAt,
    });
  });

  it('atomically records ACCEPT as paid and appends one accepted fact', async () => {
    const actionUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const orderUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const lifecycleAppend = jest.fn().mockResolvedValue({ count: 1 });
    const transaction = jest.fn((work: (tx: unknown) => unknown) =>
      Promise.resolve(
        work({
          uberOrderAction: {
            findFirst: jest.fn().mockResolvedValue({
              externalOrderId: 'order-1',
              action: 'ACCEPT',
            }),
            updateMany: actionUpdate,
          },
          order: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'order-db-1',
              orderStableId: 'stable-1',
              status: 'pending',
            }),
            updateMany: orderUpdate,
          },
          opsEvent: { createMany: lifecycleAppend },
        }),
      ),
    );
    const adapter = new UberOrderActionPrismaAdapter({
      $transaction: transaction,
    } as never);

    await expect(
      adapter.complete({
        taskId: 'task-1',
        leaseToken: 'lease-1',
        transition: { from: 'pending', to: 'paid' },
      }),
    ).resolves.toBe(true);

    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-db-1', status: 'pending' },
        data: expect.objectContaining({ status: 'paid' }) as unknown,
      }),
    );
    expect(lifecycleAppend).toHaveBeenCalledWith({
      data: {
        idempotencyKey: 'order.accepted:order-db-1',
        eventName: 'order.accepted',
        source: 'orders.lifecycle',
        payload: {
          orderId: 'order-db-1',
          orderStableId: 'stable-1',
        },
      },
      skipDuplicates: true,
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('refuses to let ACCEPT bypass prep_started by transitioning directly to making', async () => {
    const actionUpdate = jest.fn();
    const adapter = new UberOrderActionPrismaAdapter({
      $transaction: jest.fn((work: (tx: unknown) => unknown) =>
        Promise.resolve(
          work({
            uberOrderAction: {
              findFirst: jest.fn().mockResolvedValue({
                externalOrderId: 'order-1',
                action: 'ACCEPT',
              }),
              updateMany: actionUpdate,
            },
          }),
        ),
      ),
    } as never);

    await expect(
      adapter.complete({
        taskId: 'task-1',
        leaseToken: 'lease-1',
        transition: { from: 'pending', to: 'making' },
      }),
    ).rejects.toThrow('ACCEPT may only record local acceptance as paid');
    expect(actionUpdate).not.toHaveBeenCalled();
  });

  it('replayed ACCEPT reuses the deterministic accepted idempotency key', async () => {
    const lifecycleAppend = jest.fn().mockResolvedValue({ count: 0 });
    const orderUpdate = jest.fn();
    const adapter = new UberOrderActionPrismaAdapter({
      $transaction: jest.fn((work: (tx: unknown) => unknown) =>
        Promise.resolve(
          work({
            uberOrderAction: {
              findFirst: jest.fn().mockResolvedValue({
                externalOrderId: 'order-1',
                action: 'ACCEPT',
              }),
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            order: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'order-db-1',
                orderStableId: 'stable-1',
                status: 'paid',
              }),
              updateMany: orderUpdate,
            },
            opsEvent: { createMany: lifecycleAppend },
          }),
        ),
      ),
    } as never);

    await expect(
      adapter.complete({
        taskId: 'task-1',
        leaseToken: 'lease-replay',
        transition: { from: 'pending', to: 'paid' },
      }),
    ).resolves.toBe(true);

    expect(orderUpdate).not.toHaveBeenCalled();
    expect(lifecycleAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: 'order.accepted:order-db-1',
        }) as unknown,
        skipDuplicates: true,
      }),
    );
  });

  it('propagates accepted lifecycle append failure so ACCEPT cannot be acknowledged alone', async () => {
    const adapter = new UberOrderActionPrismaAdapter({
      $transaction: jest.fn((work: (tx: unknown) => unknown) =>
        Promise.resolve(
          work({
            uberOrderAction: {
              findFirst: jest.fn().mockResolvedValue({
                externalOrderId: 'order-1',
                action: 'ACCEPT',
              }),
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            order: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'order-db-1',
                orderStableId: 'stable-1',
                status: 'pending',
              }),
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            opsEvent: {
              createMany: jest
                .fn()
                .mockRejectedValue(new Error('lifecycle store unavailable')),
            },
          }),
        ),
      ),
    } as never);

    await expect(
      adapter.complete({
        taskId: 'task-1',
        leaseToken: 'lease-1',
        transition: { from: 'pending', to: 'paid' },
      }),
    ).rejects.toThrow('lifecycle store unavailable');
  });

  it('preserves non-ACCEPT transitions supplied by the application service', async () => {
    const orderUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const adapter = new UberOrderActionPrismaAdapter({
      $transaction: jest.fn((work: (tx: unknown) => unknown) =>
        Promise.resolve(
          work({
            uberOrderAction: {
              findFirst: jest.fn().mockResolvedValue({
                externalOrderId: 'order-1',
                action: 'CANCEL',
              }),
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            order: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'order-db-1',
                orderStableId: 'stable-1',
                status: 'making',
              }),
              updateMany: orderUpdate,
            },
            opsEvent: { createMany: jest.fn() },
          }),
        ),
      ),
    } as never);

    await expect(
      adapter.complete({
        taskId: 'task-1',
        leaseToken: 'lease-1',
        transition: { from: 'making', to: 'refunded' },
      }),
    ).resolves.toBe(true);
    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-db-1', status: 'making' },
        data: expect.objectContaining({ status: 'refunded' }) as unknown,
      }),
    );
  });

  it.each(['complete', 'markFailed'] as const)(
    '%s rejects an expired or replaced lease',
    async (method) => {
      const updateMany = jest.fn().mockResolvedValue({ count: 0 });
      const adapter = new UberOrderActionPrismaAdapter({
        uberOrderAction: { updateMany },
        $transaction: jest.fn((work: (tx: unknown) => unknown) =>
          Promise.resolve(
            work({
              uberOrderAction: {
                findFirst: jest.fn().mockResolvedValue(null),
              },
            }),
          ),
        ),
      } as never);

      const result =
        method === 'complete'
          ? await adapter.complete({
              taskId: 'task',
              leaseToken: 'expired-token',
              transition: { from: 'pending', to: 'paid' },
            })
          : await adapter.markFailed('task', 'expired-token', {
              retryable: true,
              code: 'HTTP_503',
              message: 'unavailable',
            });
      expect(result).toBe(false);
    },
  );
});
