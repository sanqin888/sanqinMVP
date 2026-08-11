import { UberOrderActionPrismaAdapter } from './uber-order-action-prisma.adapter';

const intent = {
  externalOrderId: 'order-1',
  action: 'ACCEPT' as const,
  idempotencyKey: 'key-1',
  businessVersion: 'v1',
  reasonCode: null,
  reasonDetail: null,
};

describe('UberOrderActionPrismaAdapter contract', () => {
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

  it('uses one SKIP LOCKED statement for concurrent claims', async () => {
    const prisma = { $queryRawUnsafe: jest.fn().mockResolvedValue([]) };
    await new UberOrderActionPrismaAdapter(prisma as never).claim({
      limit: 10,
      owner: 'worker-a',
      now: new Date(0),
      leaseDurationMs: 30_000,
    });
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(String(prisma.$queryRawUnsafe.mock.calls[0][0])).toContain('SKIP LOCKED');
  });

  it.each(['markSucceeded', 'markFailed'] as const)(
    '%s rejects an expired or replaced lease by returning false',
    async (method) => {
      const updateMany = jest.fn().mockResolvedValue({ count: 0 });
      const prisma = {
        uberOrderAction: { updateMany },
        $transaction: jest.fn(async (work: (tx: unknown) => unknown) =>
          work({
            uberOrderAction: { findFirst: jest.fn().mockResolvedValue(null) },
          }),
        ),
      };
      const adapter = new UberOrderActionPrismaAdapter(prisma as never);
      const result =
        method === 'markSucceeded'
          ? await adapter.markSucceeded('task', 'expired-token')
          : await adapter.markFailed('task', 'expired-token', {
              retryable: true,
              code: 'HTTP_503',
              message: 'unavailable',
            });
      expect(result).toBe(false);
      if (method === 'markFailed')
        expect(updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ leaseToken: 'expired-token' }),
          }),
        );
    },
  );
});
