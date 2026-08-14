import type {
  UberRateLimitAcquireCommand,
  UberRateLimitCoordinationRepositoryPort,
} from './uber-rate-limiter';
import { DatabaseUberRateLimiter } from './uber-database-rate-limiter';

class SharedCoordinationRepository implements UberRateLimitCoordinationRepositoryPort {
  readonly states = new Map<
    string,
    { tokens: number; updatedAt: number; cooldownUntil: number }
  >();
  readonly leases = new Map<
    string,
    { partitionKey: string; expiresAt: number }
  >();

  tryAcquire(command: UberRateLimitAcquireCommand) {
    const now = command.now.getTime();
    for (const [id, lease] of this.leases) {
      if (lease.partitionKey === command.partitionKey && lease.expiresAt <= now)
        this.leases.delete(id);
    }
    const state = this.states.get(command.partitionKey) ?? {
      tokens: command.burst,
      updatedAt: now,
      cooldownUntil: 0,
    };
    state.tokens = Math.min(
      command.burst,
      state.tokens + ((now - state.updatedAt) / 1_000) * command.ratePerSecond,
    );
    state.updatedAt = now;
    this.states.set(command.partitionKey, state);
    const active = [...this.leases.values()].filter(
      (lease) => lease.partitionKey === command.partitionKey,
    ).length;
    if (
      now < state.cooldownUntil ||
      active >= command.concurrencyLimit ||
      state.tokens < command.weight
    ) {
      return Promise.resolve({
        acquired: false as const,
        retryAfterMs: Math.max(
          5,
          state.cooldownUntil - now,
          ((command.weight - state.tokens) / command.ratePerSecond) * 1_000,
        ),
      });
    }
    state.tokens -= command.weight;
    this.leases.set(command.leaseId, {
      partitionKey: command.partitionKey,
      expiresAt: command.leaseExpiresAt.getTime(),
    });
    return Promise.resolve({ acquired: true as const });
  }

  release(leaseId: string) {
    this.leases.delete(leaseId);
    return Promise.resolve();
  }

  extendCooldown(partitionKey: string, until: Date) {
    const state = this.states.get(partitionKey);
    if (state)
      state.cooldownUntil = Math.max(state.cooldownUntil, until.getTime());
    return Promise.resolve();
  }
}

const config = (overrides: Record<string, number> = {}) => ({
  uberApiConcurrencyPerPartition: 1,
  uberApiRatePerSecond: 1000,
  uberApiBurst: 10,
  uberApiQueueLengthPerPartition: 10,
  uberApiQueueWaitTimeoutMs: 250,
  operationWeight: () => 1,
  ...overrides,
});
const request = (partitionKey: string, weight = 1) => ({
  partitionKey,
  operation: 'test',
  weight,
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('DatabaseUberRateLimiter', () => {
  it('awaits release persistence and propagates repository failures', async () => {
    const repository = new SharedCoordinationRepository();
    let finishRelease: (() => void) | undefined;
    const releasePending = new Promise<void>((resolve) => {
      finishRelease = resolve;
    });
    jest.spyOn(repository, 'release').mockReturnValueOnce(releasePending);
    const lease = await new DatabaseUberRateLimiter(
      config(),
      repository,
    ).acquire(request('store'));
    let settled = false;
    const releasing = lease.release().then(() => {
      settled = true;
    });
    await settle();
    expect(settled).toBe(false);
    finishRelease?.();
    await releasing;

    const failedLease = await new DatabaseUberRateLimiter(
      config(),
      repository,
    ).acquire(request('other-store'));
    jest
      .spyOn(repository, 'release')
      .mockRejectedValueOnce(new Error('release unavailable'));
    await expect(failedLease.release()).rejects.toThrow('release unavailable');
  });

  it('awaits 429 cooldown persistence, propagates failures, and ignores non-429 feedback', async () => {
    const repository = new SharedCoordinationRepository();
    let finishCooldown: (() => void) | undefined;
    const cooldownPending = new Promise<void>((resolve) => {
      finishCooldown = resolve;
    });
    const extend = jest
      .spyOn(repository, 'extendCooldown')
      .mockReturnValueOnce(cooldownPending);
    const limiter = new DatabaseUberRateLimiter(config(), repository);
    const lease = await limiter.acquire(request('store'));
    let settled = false;
    const feedback = lease
      .feedback({ status: 429, retryAfter: '1' })
      .then(() => {
        settled = true;
      });
    await settle();
    expect(settled).toBe(false);
    finishCooldown?.();
    await feedback;
    await lease.feedback({ status: 200, retryAfter: null });
    expect(extend).toHaveBeenCalledTimes(1);
    extend.mockRejectedValueOnce(new Error('cooldown unavailable'));
    await expect(
      lease.feedback({ status: 429, retryAfter: null }),
    ).rejects.toThrow('cooldown unavailable');
  });
  it('acquires and releases a shared concurrency lease', async () => {
    const repository = new SharedCoordinationRepository();
    const limiter = new DatabaseUberRateLimiter(config(), repository);
    const first = await limiter.acquire(request('store'));
    await first.release();
    await expect(limiter.acquire(request('store'))).resolves.toBeDefined();
  });

  it('enforces token rate and burst weight', async () => {
    const limiter = new DatabaseUberRateLimiter(
      config({ uberApiRatePerSecond: 1, uberApiBurst: 2 }),
      new SharedCoordinationRepository(),
    );
    const burst = await limiter.acquire(request('store', 2));
    await burst.release();
    await expect(limiter.acquire(request('store'))).rejects.toMatchObject({
      reason: 'wait_timeout',
    });
  });

  it('shares concurrency across API and worker instances', async () => {
    const repository = new SharedCoordinationRepository();
    const api = new DatabaseUberRateLimiter(config(), repository);
    const worker = new DatabaseUberRateLimiter(config(), repository);
    const first = await api.acquire(request('store'));
    const waiting = worker.acquire(request('store'));
    await new Promise((resolve) => setTimeout(resolve, 10));
    await first.release();
    await expect(waiting).resolves.toBeDefined();
  });

  it('recovers and cleans an expired lease', async () => {
    const repository = new SharedCoordinationRepository();
    const first = new DatabaseUberRateLimiter(
      config(),
      repository,
      undefined,
      5,
    );
    const second = new DatabaseUberRateLimiter(config(), repository);
    await first.acquire(request('store'));
    await new Promise((resolve) => setTimeout(resolve, 6));
    await expect(second.acquire(request('store'))).resolves.toBeDefined();
    expect(repository.leases.size).toBe(1);
  });

  it('times out while an unexpired concurrency lease is active', async () => {
    const repository = new SharedCoordinationRepository();
    const first = new DatabaseUberRateLimiter(config(), repository);
    const second = new DatabaseUberRateLimiter(
      config({ uberApiQueueWaitTimeoutMs: 20 }),
      repository,
    );
    await first.acquire(request('store'));
    await expect(second.acquire(request('store'))).rejects.toMatchObject({
      reason: 'wait_timeout',
    });
  });

  it('isolates partitions while coordinating concurrent same-partition attempts', async () => {
    const repository = new SharedCoordinationRepository();
    const first = new DatabaseUberRateLimiter(config(), repository);
    const second = new DatabaseUberRateLimiter(config(), repository);
    const [storeA, storeB] = await Promise.all([
      first.acquire(request('store-a')),
      second.acquire(request('store-b')),
    ]);
    await expect(
      Promise.allSettled([
        first.acquire(request('store-a')),
        second.acquire(request('store-a')),
      ]),
    ).resolves.toEqual([
      expect.objectContaining({ status: 'rejected' }),
      expect.objectContaining({ status: 'rejected' }),
    ]);
    await storeA.release();
    await storeB.release();
  });

  it('shares Retry-After cooldown and resumes afterward', async () => {
    const repository = new SharedCoordinationRepository();
    const api = new DatabaseUberRateLimiter(
      config({ uberApiQueueWaitTimeoutMs: 500 }),
      repository,
    );
    const worker = new DatabaseUberRateLimiter(
      config({ uberApiQueueWaitTimeoutMs: 500 }),
      repository,
    );
    const lease = await api.acquire(request('store'));
    await lease.feedback({ status: 429, retryAfter: '0.05' });
    await lease.release();
    const started = Date.now();
    const next = await worker.acquire(request('store'));
    expect(Date.now() - started).toBeGreaterThanOrEqual(35);
    await next.release();
  });
});
