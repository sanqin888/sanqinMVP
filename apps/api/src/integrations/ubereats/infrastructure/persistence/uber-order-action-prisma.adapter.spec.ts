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
    'enqueues %s without interpreting its target order status',
    async (action) => {
      type CreateInput = {
        data: Record<string, unknown>;
        select: { id: boolean };
      };
      const create = jest
        .fn<Promise<{ id: string }>, [CreateInput]>()
        .mockResolvedValue({ id: `task-${action}` });
      const adapter = new UberOrderActionPrismaAdapter({
        uberOrderAction: { create },
      } as never);
      await expect(adapter.enqueue({ ...intent, action })).resolves.toEqual({
        taskId: `task-${action}`,
        created: true,
      });
      const createInput = create.mock.calls[0][0];
      expect(createInput.data).toMatchObject({ action, status: 'PENDING' });
      expect(createInput.select).toEqual({ id: true });
      expect(createInput.data).not.toHaveProperty('orderStatus');
    },
  );

  it('returns the existing durable task after a duplicate enqueue race', async () => {
    const prisma = {
      uberOrderAction: {
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'existing-task' }),
      },
    };
    await expect(
      new UberOrderActionPrismaAdapter(prisma as never).enqueue(intent),
    ).resolves.toEqual({ taskId: 'existing-task', created: false });
  });

  it('uses one atomic SKIP LOCKED update and concurrent workers receive no duplicate', async () => {
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
    expect(
      new Set([...first, ...second].map(({ taskId }) => taskId)).size,
    ).toBe(2);
    expect(queryRaw.mock.calls).toHaveLength(2);
    expect(sqlText(queryRaw.mock.calls[0][0])).toContain(
      'FOR UPDATE SKIP LOCKED',
    );
    expect(sqlText(queryRaw.mock.calls[0][0])).toContain(
      'UPDATE "UberOrderAction"',
    );
    const claimPredicate = queryRaw.mock.calls[0].find(
      (value): value is { sql: string } =>
        typeof value === 'object' && value !== null && 'sql' in value,
    );
    expect(claimPredicate?.sql).toContain("status = 'PENDING'");
    expect(claimPredicate?.sql).toContain(
      "status = 'FAILED' AND retryable = true",
    );
    expect(claimPredicate?.sql).toContain("status = 'PROCESSING'");
    expect(claimPredicate?.sql).not.toContain(
      "status = 'FAILED' AND retryable = false",
    );
  });

  it('makes an expired processing lease claimable and returns an application task', async () => {
    const row = claimedRow('expired');
    const queryRaw = jest
      .fn<ReturnType<RawTag>, Parameters<RawTag>>()
      .mockResolvedValue([row]);
    const adapter = new UberOrderActionPrismaAdapter({
      $queryRaw: queryRaw,
    } as never);

    await expect(
      adapter.claim({
        limit: 1,
        owner: 'recovery',
        now: new Date(1_000),
        leaseDurationMs: 500,
      }),
    ).resolves.toEqual([
      {
        taskId: 'expired',
        leaseToken: row.leaseToken,
        externalOrderId: row.externalOrderId,
        action: row.action,
        idempotencyKey: row.idempotencyKey,
        businessVersion: row.businessVersion,
        reasonCode: row.reasonCode,
        reasonDetail: row.reasonDetail,
      },
    ]);

    const statement = sqlText(queryRaw.mock.calls[0][0]);
    expect(statement).toContain('"leaseExpiresAt"');
    expect(statement).toContain('"leaseToken"');
  });

  it('does not invent a claim when the database excludes an unexpired task', async () => {
    const queryRaw = jest
      .fn<ReturnType<RawTag>, Parameters<RawTag>>()
      .mockResolvedValue([]);
    const adapter = new UberOrderActionPrismaAdapter({
      $queryRaw: queryRaw,
    } as never);
    await expect(
      adapter.claim({
        limit: 1,
        owner: 'worker',
        now: new Date(1_000),
        leaseDurationMs: 500,
      }),
    ).resolves.toEqual([]);
  });

  it('binds the requested claim limit', async () => {
    const queryRaw = jest
      .fn<ReturnType<RawTag>, Parameters<RawTag>>()
      .mockResolvedValue([]);
    const adapter = new UberOrderActionPrismaAdapter({
      $queryRaw: queryRaw,
    } as never);
    await adapter.claim({
      limit: 3,
      owner: 'worker',
      now: new Date(0),
      leaseDurationMs: 500,
    });

    expect(sqlText(queryRaw.mock.calls[0][0])).toContain('LIMIT ?');
    expect(queryRaw.mock.calls[0]).toContain(3);
  });

  it('persists exactly the transition supplied by the application service', async () => {
    type UpdateInput = { where: Record<string, unknown> };
    const actionUpdate = jest
      .fn<Promise<{ count: number }>, [UpdateInput]>()
      .mockResolvedValue({ count: 1 });
    const orderUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const orderFind = jest.fn().mockResolvedValue({
      id: 'order-db-1',
      orderStableId: 'stable-1',
      status: 'making',
    });
    const prisma = {
      $transaction: jest.fn((work: (tx: unknown) => unknown) =>
        Promise.resolve(
          work({
            uberOrderAction: {
              findFirst: jest.fn().mockResolvedValue({
                externalOrderId: 'order-1',
                action: 'CANCEL',
              }),
              updateMany: actionUpdate,
            },
            order: { findUnique: orderFind, updateMany: orderUpdate },
            opsEvent: { createMany: jest.fn() },
          }),
        ),
      ),
    };
    const adapter = new UberOrderActionPrismaAdapter(prisma as never);

    await expect(
      adapter.complete({
        taskId: 'task-1',
        leaseToken: 'lease-1',
        transition: { from: 'making', to: 'refunded' },
      }),
    ).resolves.toBe(true);

    expect(orderUpdate).toHaveBeenCalledWith({
      where: {
        id: 'order-db-1',
        status: 'making',
      },
      data: {
        status: 'refunded',
        makingAt: undefined,
        readyAt: undefined,
      },
    });
    const actionWhere = actionUpdate.mock.calls[0][0];
    expect(actionWhere.where).toMatchObject({ leaseToken: 'lease-1' });
  });

  it('atomically appends one durable accepted lifecycle fact with pending -> making', async () => {
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
        transition: { from: 'pending', to: 'making' },
      }),
    ).resolves.toBe(true);

    expect(actionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ leaseToken: 'lease-1' }) as unknown,
        data: expect.objectContaining({ status: 'SUCCEEDED' }) as unknown,
      }),
    );
    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-db-1', status: 'pending' },
        data: expect.objectContaining({ status: 'making' }) as unknown,
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

  it('replayed ACCEPT reuses the deterministic lifecycle idempotency key without another local transition', async () => {
    const orderUpdate = jest.fn();
    const lifecycleAppend = jest.fn().mockResolvedValue({ count: 0 });
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
                status: 'making',
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
        transition: { from: 'pending', to: 'making' },
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

  it('propagates lifecycle append failure so the enclosing transaction cannot acknowledge ACCEPT alone', async () => {
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
        transition: { from: 'pending', to: 'making' },
      }),
    ).rejects.toThrow('lifecycle store unavailable');
  });

  it.each(['complete', 'markFailed'] as const)(
    '%s rejects an expired or replaced lease by returning false',
    async (method) => {
      const updateMany = jest
        .fn<Promise<{ count: number }>, [{ where: { leaseToken: string } }]>()
        .mockResolvedValue({ count: 0 });
      const prisma = {
        uberOrderAction: { updateMany },
        $transaction: jest.fn((work: (tx: unknown) => unknown) =>
          Promise.resolve(
            work({
              uberOrderAction: { findFirst: jest.fn().mockResolvedValue(null) },
            }),
          ),
        ),
      };
      const adapter = new UberOrderActionPrismaAdapter(prisma as never);
      const result =
        method === 'complete'
          ? await adapter.complete({
              taskId: 'task',
              leaseToken: 'expired-token',
              transition: { from: 'pending', to: 'making' },
            })
          : await adapter.markFailed('task', 'expired-token', {
              retryable: true,
              code: 'HTTP_503',
              message: 'unavailable',
            });
      expect(result).toBe(false);
      if (method === 'markFailed')
        expect(updateMany.mock.calls[0]?.[0].where.leaseToken).toBe(
          'expired-token',
        );
    },
  );
});
