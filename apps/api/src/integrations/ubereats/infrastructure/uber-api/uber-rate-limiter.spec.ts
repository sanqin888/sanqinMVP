import {
  ProcessUberRateLimiter,
  UberRateLimitRejectedError,
} from './uber-rate-limiter';

const config = (overrides: Record<string, number> = {}) => ({
  uberApiConcurrencyPerPartition: 1,
  uberApiRatePerSecond: 1000,
  uberApiBurst: 10,
  uberApiQueueLengthPerPartition: 1,
  uberApiQueueWaitTimeoutMs: 50,
  operationWeight: () => 1,
  ...overrides,
});
const request = (partitionKey: string, weight = 1) => ({
  partitionKey,
  operation: 'test',
  weight,
});

describe('ProcessUberRateLimiter contract', () => {
  afterEach(() => jest.useRealTimers());

  it('isolates merchant/store partitions', async () => {
    const limiter = new ProcessUberRateLimiter(
      config({ uberApiQueueWaitTimeoutMs: 2_000 }),
    );
    const merchant = await limiter.acquire(request('merchant-1'));
    await expect(limiter.acquire(request('store-2'))).resolves.toBeDefined();
    await merchant.release();
  });

  it('rejects immediately when the bounded partition queue is full', async () => {
    const limiter = new ProcessUberRateLimiter(config());
    const active = await limiter.acquire(request('store-1'));
    const queued = limiter.acquire(request('store-1'));
    await expect(
      limiter.acquire(request('store-1')),
    ).rejects.toMatchObject<UberRateLimitRejectedError>({
      reason: 'queue_full',
    });
    await active.release();
    await (await queued).release();
  });

  it('rejects a queued request after its maximum wait time', async () => {
    jest.useFakeTimers();
    const limiter = new ProcessUberRateLimiter(
      config({ uberApiQueueWaitTimeoutMs: 20 }),
    );
    await limiter.acquire(request('store-1'));
    const queued = limiter.acquire(request('store-1'));
    const assertion = expect(queued).rejects.toMatchObject({
      reason: 'wait_timeout',
    });
    await jest.advanceTimersByTimeAsync(21);
    await assertion;
  });

  it('feeds 429 Retry-After back as a partition cooldown', async () => {
    jest.useFakeTimers();
    const limiter = new ProcessUberRateLimiter(
      config({ uberApiQueueWaitTimeoutMs: 2_000 }),
    );
    const active = await limiter.acquire(request('store-1'));
    await active.feedback({ status: 429, retryAfter: '1' });
    await active.release();
    let acquired = false;
    const queued = limiter.acquire(request('store-1')).then((lease) => {
      acquired = true;
      return lease;
    });
    await jest.advanceTimersByTimeAsync(999);
    expect(acquired).toBe(false);
    await jest.advanceTimersByTimeAsync(2);
    await (await queued).release();
  });

  it('charges operation weight from the token bucket', async () => {
    const limiter = new ProcessUberRateLimiter(
      config({ uberApiBurst: 2, uberApiRatePerSecond: 1 }),
    );
    const lease = await limiter.acquire(request('store-1', 2));
    await lease.release();
    await expect(
      Promise.race([
        limiter.acquire(request('store-1')),
        new Promise((resolve) => setTimeout(() => resolve('waiting'), 10)),
      ]),
    ).resolves.toBe('waiting');
  });
});
