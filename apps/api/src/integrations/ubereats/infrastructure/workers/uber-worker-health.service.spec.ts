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
    inFlightStartedAt: null,
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
    databaseReady = true,
    env: Record<string, string> = {},
    durableFailures = { webhookInbox: 0, orderAction: 0 },
  ) =>
    new UberWorkerHealthService(
      adapter(adapterMetrics[0]) as never,
      adapter(adapterMetrics[1]) as never,
      new UberWorkerConfigService({
        UBER_EATS_WORKER_ENABLED: 'true',
        UBER_EATS_WORKER_WAKE_FALLBACK_POLL_INTERVAL_MS: '1000',
        UBER_EATS_WORKER_SCHEDULER_SILENCE_MULTIPLIER: '3',
        UBER_EATS_WEBHOOK_INBOX_WORKER_MAX_BACKOFF_MS: '1000',
        UBER_EATS_ORDER_ACTION_WORKER_MAX_BACKOFF_MS: '1000',
        UBER_EATS_WORKER_MAX_POLL_DURATION_MS: '5000',
        ...env,
      }),
      {
        probeDatabase: jest.fn().mockResolvedValue(databaseReady),
        readDurableFailures: jest.fn().mockResolvedValue(durableFailures),
      } as never,
    );

  beforeEach(() => jest.useFakeTimers().setSystemTime(now));
  afterEach(() => jest.useRealTimers());

  it('is starting and not ready until every adapter has entered polling', async () => {
    const health = createHealth([
      metrics(),
      metrics({ lastAttemptAt: now, lastSuccessfulAt: now }),
    ]);

    await expect(health.snapshot()).resolves.toMatchObject({
      status: 'starting',
      checks: { database: 'ok', scheduler: 'starting' },
    });
    await expect(health.readiness()).resolves.toMatchObject({
      status: 'not_ready',
      checks: { database: 'ok', scheduler: 'starting' },
    });
  });

  it('is ready and healthy after successful polls on every adapter', async () => {
    const healthy = metrics({ lastAttemptAt: now, lastSuccessfulAt: now });

    await expect(
      createHealth([healthy, healthy]).snapshot(),
    ).resolves.toMatchObject({
      status: 'ok',
      checks: { database: 'ok', scheduler: 'ok' },
      thresholds: {
        maxPollSilenceMs: 3000,
        maxInFlightAgeMs: 5000,
      },
    });
  });

  it('keeps provider failures and business backlog degraded but runtime-ready', async () => {
    const healthy = metrics({ lastAttemptAt: now, lastSuccessfulAt: now });
    const providerFailure = metrics({
      lastAttemptAt: now,
      lastSuccessfulAt: now,
      lastFailureAt: now,
      consecutiveFailures: 10,
      failures: 10,
    });
    const health = createHealth([healthy, providerFailure]);

    await expect(health.snapshot()).resolves.toMatchObject({
      status: 'degraded',
      checks: { database: 'ok', scheduler: 'ok' },
    });
    await expect(health.readiness()).resolves.toMatchObject({
      status: 'ok',
    });

    await expect(
      createHealth([healthy, { ...healthy, backlog: 5 }]).snapshot(),
    ).resolves.toMatchObject({
      status: 'degraded',
      checks: { database: 'ok', scheduler: 'ok' },
    });

    await expect(
      createHealth(
        [healthy, healthy],
        true,
        {},
        { webhookInbox: 0, orderAction: 2 },
      ).snapshot(),
    ).resolves.toMatchObject({
      status: 'degraded',
      readiness: 'ok',
      degradation: {
        durableFailures: { webhookInbox: 0, orderAction: 2 },
      },
    });
  });

  it('fails readiness when PostgreSQL is unavailable', async () => {
    const healthy = metrics({ lastAttemptAt: now, lastSuccessfulAt: now });
    const health = createHealth([healthy, healthy], false);

    await expect(health.snapshot()).resolves.toMatchObject({
      status: 'unhealthy',
      checks: { database: 'failed', scheduler: 'ok' },
    });
    await expect(health.readiness()).resolves.toMatchObject({
      status: 'not_ready',
    });
  });

  it('detects a poll that remains in flight beyond the configured threshold', async () => {
    const stuck = metrics({
      lastAttemptAt: new Date(now.getTime() - 5001),
      inFlightStartedAt: new Date(now.getTime() - 5001),
    });

    await expect(
      createHealth([stuck, stuck]).snapshot(),
    ).resolves.toMatchObject({
      status: 'unhealthy',
      checks: { database: 'ok', scheduler: 'stuck' },
    });
  });

  it('detects scheduler silence beyond the longest legitimate retry window', async () => {
    const stale = metrics({
      lastAttemptAt: new Date(now.getTime() - 3001),
      lastSuccessfulAt: new Date(now.getTime() - 3001),
    });

    await expect(
      createHealth([stale, stale]).snapshot(),
    ).resolves.toMatchObject({
      status: 'unhealthy',
      checks: { database: 'ok', scheduler: 'stuck' },
    });
  });

  it('returns to ok after provider recovery', async () => {
    const recovered = metrics({
      lastAttemptAt: now,
      lastSuccessfulAt: now,
      lastFailureAt: new Date(now.getTime() - 1000),
      failures: 2,
      consecutiveFailures: 0,
    });

    await expect(
      createHealth([recovered, recovered]).snapshot(),
    ).resolves.toMatchObject({
      status: 'ok',
      checks: { database: 'ok', scheduler: 'ok' },
    });
  });

  it('fails readiness once graceful shutdown begins', async () => {
    const healthy = metrics({ lastAttemptAt: now, lastSuccessfulAt: now });
    const health = createHealth([healthy, healthy]);

    health.onModuleDestroy();

    await expect(health.snapshot()).resolves.toMatchObject({
      status: 'unhealthy',
      checks: { database: 'ok', scheduler: 'stopping' },
    });
    await expect(health.readiness()).resolves.toMatchObject({
      status: 'not_ready',
    });
  });
});
