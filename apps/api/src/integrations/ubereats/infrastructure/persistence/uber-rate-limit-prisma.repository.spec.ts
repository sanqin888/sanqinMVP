import { UberRateLimitPrismaRepository } from './uber-rate-limit-prisma.repository';

type RawQuery = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;
type RawExecute = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<number>;

const command = {
  partitionKey: 'store-1',
  leaseId: '00000000-0000-4000-8000-000000000001',
  now: new Date('2026-01-01T00:00:01.000Z'),
  leaseExpiresAt: new Date('2026-01-01T00:00:31.000Z'),
  ratePerSecond: 2,
  burst: 5,
  concurrencyLimit: 2,
  weight: 1,
};

describe('UberRateLimitPrismaRepository', () => {
  it('locks one partition and atomically cleans, debits and creates a lease', async () => {
    const executeRaw = jest
      .fn<ReturnType<RawExecute>, Parameters<RawExecute>>()
      .mockResolvedValue(1);
    const queryRaw = jest
      .fn<ReturnType<RawQuery>, Parameters<RawQuery>>()
      .mockResolvedValue([
        {
          tokens: 3,
          lastRefillAt: new Date('2026-01-01T00:00:00.000Z'),
          cooldownUntil: null,
        },
      ]);
    const tx = {
      $executeRaw: executeRaw,
      $queryRaw: queryRaw,
      uberRateLimitState: {
        upsert: jest.fn(),
        update: jest.fn(),
      },
      uberRateLimitLease: {
        deleteMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    };

    await expect(
      new UberRateLimitPrismaRepository(prisma as never).tryAcquire(command),
    ).resolves.toEqual({ acquired: true });

    expect(queryRaw).toHaveBeenCalledTimes(2);
    const advisoryLockSql = queryRaw.mock.calls[0][0].join('?');
    expect(advisoryLockSql).toContain('pg_advisory_xact_lock');
    expect(advisoryLockSql).toMatch(
      /pg_advisory_xact_lock\([\s\S]*hashtextextended\([\s\S]*\)[\s\S]*\)::text AS "lockResult"/,
    );
    expect(queryRaw.mock.calls[1][0].join('?')).toContain('FOR UPDATE');
    expect(tx.uberRateLimitLease.deleteMany).toHaveBeenCalledWith({
      where: { partitionKey: 'store-1', expiresAt: { lte: command.now } },
    });
    expect(tx.uberRateLimitState.update).toHaveBeenCalledWith({
      where: { partitionKey: command.partitionKey },
      data: { tokens: 4, lastRefillAt: command.now },
    });
    expect(tx.uberRateLimitLease.create).toHaveBeenCalledWith({
      data: {
        id: command.leaseId,
        partitionKey: command.partitionKey,
        expiresAt: command.leaseExpiresAt,
      },
    });
  });

  it('extends cooldown with GREATEST while holding the same partition lock', async () => {
    const executeRaw = jest
      .fn<ReturnType<RawExecute>, Parameters<RawExecute>>()
      .mockResolvedValue(1);
    const tx = {
      $executeRaw: executeRaw,
      $queryRaw: jest
        .fn<ReturnType<RawQuery>, Parameters<RawQuery>>()
        .mockResolvedValue([]),
      uberRateLimitState: { upsert: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    };
    await new UberRateLimitPrismaRepository(prisma as never).extendCooldown(
      'store-1',
      command.leaseExpiresAt,
    );
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(executeRaw.mock.calls[0][0].join('?')).toContain('GREATEST');
  });
});
