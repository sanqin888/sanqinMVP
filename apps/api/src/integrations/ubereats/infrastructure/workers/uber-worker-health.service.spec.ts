import type { UberWorkerMetrics } from './uber-worker.adapters';
import { UberWorkerConfigService } from './uber-worker-config.service';
import { UberWorkerHealthService } from './uber-worker-health.service';

describe('UberWorkerHealthService', () => {
  const now = new Date('2026-08-13T12:00:00.000Z');
  const metrics = (
    overrides: Partial<UberWorkerMetrics> = {},
  ): UberWorkerMetrics => ({
    lastSuccessfulAt: null,
    lastAttemptAt: null,
    lastFailureAt: null,
    consecutiveFailures: 0,
    claimed: 0,
    failures: 0,
    backlog: 0,
    leaseRecoveries: 0,
    ...overrides,
  });
  const adapter = (initial: UberWorkerMetrics) => ({
    getMetrics: jest.fn(() => initial),
  });
  const createHealth = (
    adapterMetrics: UberWorkerMetrics[],
    env: Record<string, string> = {},
  ) =>
    new UberWorkerHealthService(
      adapter(adapterMetrics[0]) as never,
      adapter(adapterMetrics[1]) as never,
      adapter(adapterMetrics[2]) as never,
      new UberWorkerConfigService({
        UBER_EATS_WORKER_ENABLED: 'true',
        UBER_EATS_WORKER_POLL_INTERVAL_MS: '1000',
        UBER_EATS_WORKER_UNHEALTHY_FAILURE_THRESHOLD: '3',
        ...env,
      }),
    );

  beforeEach(() => jest.useFakeTimers().setSystemTime(now));
  afterEach(() => jest.useRealTimers());

  it('is starting until every adapter has attempted its first poll', () => {
    const health = createHealth([
      metrics(),
      metrics({ lastAttemptAt: now, lastSuccessfulAt: now }),
      metrics({ lastAttemptAt: now, lastSuccessfulAt: now }),
    ]);
    expect(health.snapshot().status).toBe('starting');
  });

  it('is ok after the first successful poll on every adapter', () => {
    const healthy = metrics({ lastAttemptAt: now, lastSuccessfulAt: now });
    expect(createHealth([healthy, healthy, healthy]).snapshot()).toMatchObject({
      status: 'ok',
      thresholds: { consecutiveFailures: 3, lastSuccessAgeMs: 3000 },
    });
  });

  it('is degraded for a temporary failure or a growing backlog', () => {
    const healthy = metrics({ lastAttemptAt: now, lastSuccessfulAt: now });
    const temporaryFailure = metrics({
      lastAttemptAt: now,
      lastSuccessfulAt: now,
      lastFailureAt: now,
      consecutiveFailures: 1,
      failures: 1,
    });
    expect(
      createHealth([healthy, temporaryFailure, healthy]).snapshot().status,
    ).toBe('degraded');
    expect(
      createHealth([healthy, { ...healthy, backlog: 5 }, healthy]).snapshot()
        .status,
    ).toBe('degraded');
  });

  it('is unhealthy at the configured consecutive failure threshold', () => {
    const healthy = metrics({ lastAttemptAt: now, lastSuccessfulAt: now });
    const failing = metrics({
      lastAttemptAt: now,
      lastSuccessfulAt: now,
      lastFailureAt: now,
      consecutiveFailures: 3,
      failures: 3,
    });
    expect(createHealth([healthy, failing, healthy]).snapshot().status).toBe(
      'unhealthy',
    );
  });

  it('is unhealthy when success is older than poll interval times the threshold', () => {
    const stale = metrics({
      lastAttemptAt: now,
      lastSuccessfulAt: new Date(now.getTime() - 3001),
    });
    expect(createHealth([stale, stale, stale]).snapshot().status).toBe(
      'unhealthy',
    );
  });

  it('returns to ok after a successful recovery snapshot', () => {
    const recovered = metrics({
      lastAttemptAt: now,
      lastSuccessfulAt: now,
      lastFailureAt: new Date(now.getTime() - 1000),
      failures: 2,
      consecutiveFailures: 0,
    });
    expect(
      createHealth([recovered, recovered, recovered]).snapshot().status,
    ).toBe('ok');
  });

  it('is unhealthy once graceful shutdown begins', () => {
    const healthy = metrics({ lastAttemptAt: now, lastSuccessfulAt: now });
    const health = createHealth([healthy, healthy, healthy]);

    health.onModuleDestroy();

    expect(health.snapshot().status).toBe('unhealthy');
  });
});
