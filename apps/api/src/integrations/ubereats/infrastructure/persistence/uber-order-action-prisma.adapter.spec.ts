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
  it.each(['ACCEPT', 'DENY'] as const)(
    'enqueues %s as an admission decision under a transaction lock',
    async (action) => {
      const create = jest.fn().mockResolvedValue({ id: `task-${action}` });
      const queryRaw = jest
        .fn<ReturnType<RawTag>, Parameters<RawTag>>()
        .mockResolvedValue([]);
      const tx = {
        $queryRaw: queryRaw,
        uberOrderAction: {
          findFirst: jest.fn().mockResolvedValue(null),
          create,
        },
      };
      const adapter = new UberOrderActionPrismaAdapter({
        $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
          callback(tx),
        ),
      } as never);

      await expect(adapter.enqueue({ ...intent, action })).resolves.toEqual({
        taskId: `task-${action}`,
        created: true,
      });
      const advisoryLockSql = sqlText(queryRaw.mock.calls[0][0]);
      expect(advisoryLockSql).toMatch(
        /pg_advisory_xact_lock\([\s\S]*hashtext\([\s\S]*\)[\s\S]*\)::text AS "lockResult"/,
      );
      expect(tx.uberOrderAction.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            externalOrderId: 'order-1',
          }) as unknown,
        }),
      );
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

  it.each(['CANCEL', 'READY_FOR_PICKUP'] as const)(
    'enqueues %s as a durable non-admission command',
    async (action) => {
      const create = jest.fn().mockResolvedValue({ id: `task-${action}` });
      const adapter = new UberOrderActionPrismaAdapter({
        uberOrderAction: { create },
      } as never);

      await expect(adapter.enqueue({ ...intent, action })).resolves.toEqual({
        taskId: `task-${action}`,
        created: true,
      });
    },
  );

  it('blocks the opposite admission decision when ACCEPT or DENY already exists', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      uberOrderAction: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'accept-1', action: 'ACCEPT' }),
      },
    };
    const adapter = new UberOrderActionPrismaAdapter({
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    } as never);

    await expect(
      adapter.enqueue({ ...intent, action: 'DENY' }),
    ).rejects.toThrow('UBER_ORDER_DECISION_CONFLICT:ACCEPT');
  });

  it('returns the existing task after a duplicate non-admission enqueue race', async () => {
    const adapter = new UberOrderActionPrismaAdapter({
      uberOrderAction: {
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'existing-task' }),
      },
    } as never);
    await expect(
      adapter.enqueue({ ...intent, action: 'CANCEL' }),
    ).resolves.toEqual({
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

  it.each([
    ['ACCEPT', true],
    ['CANCEL', false],
  ] as const)(
    'fences a claimed %s inside the caller-owned transaction',
    async (action, acceptanceConfirmed) => {
      const actionUpdate = jest.fn().mockResolvedValue({ count: 1 });
      const tx = {
        uberOrderAction: {
          findFirst: jest.fn().mockResolvedValue({
            externalOrderId: 'order-1',
            action,
          }),
          updateMany: actionUpdate,
        },
      };
      const adapter = new UberOrderActionPrismaAdapter({} as never);

      const result = await adapter.completeWithinTransaction(tx, {
        taskId: 'task-1',
        leaseToken: 'lease-1',
        upstreamStatus: 200,
        transition:
          action === 'ACCEPT'
            ? { from: 'pending', to: 'paid' }
            : { from: 'making', to: 'refunded' },
      });

      expect(result).toEqual({
        externalOrderId: 'order-1',
        completedAt: expect.any(Date) as unknown,
        acceptanceConfirmed,
      });
      expect(actionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'task-1',
            status: 'PROCESSING',
            leaseToken: 'lease-1',
          },
          data: expect.objectContaining({
            status: 'SUCCEEDED',
            retryable: false,
            uberHttpStatus: 200,
            leaseToken: null,
            leaseExpiresAt: null,
          }) as unknown,
        }),
      );
    },
  );

  it('refuses to let ACCEPT bypass prep_started before fencing the action', async () => {
    const actionUpdate = jest.fn();
    const tx = {
      uberOrderAction: {
        findFirst: jest.fn().mockResolvedValue({
          externalOrderId: 'order-1',
          action: 'ACCEPT',
        }),
        updateMany: actionUpdate,
      },
    };
    const adapter = new UberOrderActionPrismaAdapter({} as never);

    await expect(
      adapter.completeWithinTransaction(tx, {
        taskId: 'task-1',
        leaseToken: 'lease-1',
        transition: { from: 'pending', to: 'making' },
      }),
    ).rejects.toThrow('ACCEPT may only record local acceptance as paid');
    expect(actionUpdate).not.toHaveBeenCalled();
  });

  it('returns null when the exact claimed lease is no longer present', async () => {
    const updateMany = jest.fn();
    const tx = {
      uberOrderAction: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany,
      },
    };
    const adapter = new UberOrderActionPrismaAdapter({} as never);

    await expect(
      adapter.completeWithinTransaction(tx, {
        taskId: 'task-1',
        leaseToken: 'expired-token',
        transition: { from: 'pending', to: 'paid' },
      }),
    ).resolves.toBeNull();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('returns null when the lease fence loses a concurrent replacement race', async () => {
    const tx = {
      uberOrderAction: {
        findFirst: jest.fn().mockResolvedValue({
          externalOrderId: 'order-1',
          action: 'CANCEL',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const adapter = new UberOrderActionPrismaAdapter({} as never);

    await expect(
      adapter.completeWithinTransaction(tx, {
        taskId: 'task-1',
        leaseToken: 'replaced-token',
        transition: { from: 'making', to: 'refunded' },
      }),
    ).resolves.toBeNull();
  });

  it('markFailed rejects an expired or replaced lease', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const adapter = new UberOrderActionPrismaAdapter({
      uberOrderAction: { updateMany },
    } as never);

    await expect(
      adapter.markFailed('task', 'expired-token', {
        retryable: true,
        code: 'HTTP_503',
        message: 'unavailable',
      }),
    ).resolves.toBe(false);
  });
});
