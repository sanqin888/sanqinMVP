import {
  DistributedUberRateLimiter,
  type UberAtomicCommandStore,
} from './uber-distributed-rate-limiter';

class SharedAtomicStore implements UberAtomicCommandStore {
  active = new Set<string>();
  cooldown = 0;
  async eval(script: string, _keys: string[], args: Array<string | number>) {
    if (script.includes('ZRANGEBYSCORE')) {
      const now = Number(args[0]);
      if (now < this.cooldown || this.active.size >= Number(args[3]))
        return [0, Math.max(5, this.cooldown - now), this.active.size];
      this.active.add(String(args[5]));
      return [1, 0, this.active.size];
    }
    if (script.includes('ZREM')) this.active.delete(String(args[0]));
    if (script.includes("'cooldown'"))
      this.cooldown = Math.max(this.cooldown, Number(args[0]));
    return 1;
  }
}

const config = (timeout = 100) => ({
  uberApiConcurrencyPerPartition: 1,
  uberApiRatePerSecond: 1000,
  uberApiBurst: 1000,
  uberApiQueueLengthPerPartition: 10,
  uberApiQueueWaitTimeoutMs: timeout,
  operationWeight: () => 1,
});
const request = {
  partitionKey: 'store-1',
  operation: 'uber.menu.upload',
  weight: 5,
};

describe('DistributedUberRateLimiter', () => {
  it('serializes competing replicas and grants after lease release', async () => {
    const store = new SharedAtomicStore();
    const first = new DistributedUberRateLimiter(config(), store);
    const second = new DistributedUberRateLimiter(config(), store);
    const lease = await first.acquire(request);
    const waiting = second.acquire(request);
    await new Promise((resolve) => setTimeout(resolve, 10));
    lease.release();
    await expect(waiting).resolves.toBeDefined();
  });

  it('shares 429 cooldown across replicas', async () => {
    const store = new SharedAtomicStore();
    const first = new DistributedUberRateLimiter(config(500), store);
    const second = new DistributedUberRateLimiter(config(500), store);
    const lease = await first.acquire(request);
    lease.feedback({ status: 429, retryAfter: '0.05' });
    lease.release();
    const started = Date.now();
    const next = await second.acquire(request);
    expect(Date.now() - started).toBeGreaterThanOrEqual(35);
    next.release();
  });

  it('times out while another replica retains its lease', async () => {
    const store = new SharedAtomicStore();
    const first = new DistributedUberRateLimiter(config(30), store);
    const second = new DistributedUberRateLimiter(config(30), store);
    await first.acquire(request);
    await expect(second.acquire(request)).rejects.toMatchObject({
      reason: 'wait_timeout',
    });
  });
});
