import { createUberRateLimiter } from './infrastructure/uber-api/uber-rate-limiter.factory';
import { ProcessUberRateLimiter } from './infrastructure/uber-api/uber-rate-limiter';
import { DatabaseUberRateLimiter } from './infrastructure/uber-api/uber-database-rate-limiter';

const config = {} as never;
const metrics = {} as never;
const repository = {} as never;

describe('Uber rate limiter composition', () => {
  it('requires an explicit implementation', () => {
    expect(() =>
      createUberRateLimiter({}, config, metrics, repository),
    ).toThrow('UBER_EATS_RATE_LIMITER_MODE');
  });

  it('rejects process-local coordination in multi-replica production', () => {
    expect(() =>
      createUberRateLimiter(
        { NODE_ENV: 'production', UBER_EATS_RATE_LIMITER_MODE: 'process' },
        config,
        metrics,
        repository,
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
        repository,
      ),
    ).toBeInstanceOf(ProcessUberRateLimiter);
  });

  it('binds the database implementation without Redis credentials', () => {
    expect(
      createUberRateLimiter(
        {
          UBER_EATS_RATE_LIMITER_MODE: 'database',
        },
        config,
        metrics,
        repository,
      ),
    ).toBeInstanceOf(DatabaseUberRateLimiter);
  });
});
