import { UberWorkerConfigService } from './uber-worker-config.service';

describe('UberWorkerConfigService lease budget', () => {
  it('uses a 30 second fallback poll for durable order workers', () => {
    const config = new UberWorkerConfigService({});
    expect(config.workerWakeFallbackPollIntervalMs).toBe(30_000);
  });

  it('normalizes the optional worker wake URL', () => {
    const config = new UberWorkerConfigService({
      UBER_EATS_WORKER_WAKE_URL: 'http://ubereats-worker:4001/',
    });
    expect(config.workerWakeBaseUrl).toBe('http://ubereats-worker:4001');
    expect(config.workerWakeTimeoutMs).toBe(500);
  });

  it('accepts the safe default HTTP retry budget', () => {
    expect(() => new UberWorkerConfigService({})).not.toThrow();
  });

  it('rejects a lease shorter than the configured worst-case HTTP attempts', () => {
    expect(
      () =>
        new UberWorkerConfigService({
          UBER_EATS_WORKER_LEASE_DURATION_MS: '60000',
          UBER_EATS_ORDER_DETAIL_TIMEOUT_MS: '30000',
          UBER_EATS_HTTP_MAX_ATTEMPTS: '3',
        }),
    ).toThrow('HTTP 最坏尝试预算');
  });

  it('rejects concurrency greater than the poll batch', () => {
    expect(
      () =>
        new UberWorkerConfigService({
          UBER_EATS_WORKER_BATCH_SIZE: '1',
          UBER_EATS_WEBHOOK_INBOX_WORKER_CONCURRENCY: '2',
        }),
    ).toThrow('BATCH_SIZE');
  });
});
