jest.mock('@prisma/client', () => ({
  Prisma: {},
  PrismaClient: class {},
}));

import { UberOrderOutboxPrismaAdapter } from './uber-order-outbox-prisma.adapter';

describe('UberOrderOutboxPrismaAdapter lease fencing', () => {
  it('prevents an expired claimant from changing the new claimant status', async () => {
    const base = {
      taskId: 'task-1',
      externalOrderId: 'order-1',
      action: 'ACCEPT' as const,
      reasonCode: null,
      reasonDetail: null,
      idempotencyKey: 'key-1',
      businessVersion: 'v1',
    };
    const leases = ['lease-a', 'lease-b'];
    const state = { status: 'PENDING', leaseToken: '' };
    const updateMany = jest.fn(
      ({
        where,
        data,
      }: {
        where: Record<string, string>;
        data: { status: string };
      }) => {
        const matches =
          where.id === 'task-1' &&
          where.status === state.status &&
          where.leaseToken === state.leaseToken;
        if (matches) {
          state.status = data.status;
          state.leaseToken = '';
        }
        return Promise.resolve({ count: matches ? 1 : 0 });
      },
    );
    const prisma = {
      $queryRaw: jest.fn(() => {
        const leaseToken = leases.shift();
        state.status = 'PROCESSING';
        state.leaseToken = leaseToken ?? '';
        return Promise.resolve([{ ...base, leaseToken }]);
      }),
      uberOrderAction: { updateMany },
    };
    const adapter = new UberOrderOutboxPrismaAdapter(
      prisma as never,
      {} as never,
    );

    const [claimA] = await adapter.claimDue(1);
    // Simulate expiry: the database makes the same row claimable before B claims.
    const [claimB] = await adapter.claimDue(1);

    expect(claimA.leaseToken).toBe('lease-a');
    expect(claimB.leaseToken).toBe('lease-b');
    await expect(adapter.markSucceeded(claimA)).resolves.toBe(false);
    expect(state).toEqual({ status: 'PROCESSING', leaseToken: 'lease-b' });

    await expect(adapter.markSucceeded(claimB)).resolves.toBe(true);
    expect(state.status).toBe('SUCCEEDED');
    expect(updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          id: 'task-1',
          status: 'PROCESSING',
          leaseToken: 'lease-a',
        },
      }),
    );
  });
});
