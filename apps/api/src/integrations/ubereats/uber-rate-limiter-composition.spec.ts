import { createUberRateLimiter } from './infrastructure/uber-api/uber-rate-limiter.factory';
import { ProcessUberRateLimiter } from './infrastructure/uber-api/uber-rate-limiter';
import { DistributedUberRateLimiter } from './infrastructure/uber-api/uber-distributed-rate-limiter';

const config = {} as never;
const metrics = {} as never;

describe('Uber rate limiter composition', () => {
  it('requires an explicit implementation', () => {
    expect(() => createUberRateLimiter({}, config, metrics)).toThrow(
      'UBER_EATS_RATE_LIMITER_MODE',
    );
  });

  it('rejects process-local coordination in multi-replica production', () => {
    expect(() =>
      createUberRateLimiter(
        { NODE_ENV: 'production', UBER_EATS_RATE_LIMITER_MODE: 'process' },
        config,
        metrics,
      ),
    ).toThrow('生产多副本禁止');
    expect(
      createUberRateLimiter(
        {
          NODE_ENV: 'production',
          UBER_EATS_RATE_LIMITER_MODE: 'process',
          UBER_EATS_SINGLE_REPLICA: 'true',
        },
        config,
        metrics,
      ),
    ).toBeInstanceOf(ProcessUberRateLimiter);
  });

  it('binds the distributed implementation only with coordinator credentials', () => {
    expect(() =>
      createUberRateLimiter(
        { UBER_EATS_RATE_LIMITER_MODE: 'distributed' },
        config,
        metrics,
      ),
    ).toThrow('Redis HTTP URL/token');
    expect(
      createUberRateLimiter(
        {
          UBER_EATS_RATE_LIMITER_MODE: 'distributed',
          UBER_EATS_RATE_LIMIT_REDIS_HTTP_URL: 'https://redis.example',
          UBER_EATS_RATE_LIMIT_REDIS_HTTP_TOKEN: 'secret',
        },
        config,
        metrics,
      ),
    ).toBeInstanceOf(DistributedUberRateLimiter);
  });
});
