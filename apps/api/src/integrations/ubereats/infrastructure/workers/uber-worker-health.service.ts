import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';

import {
  UBER_WORKER_RUNTIME_READINESS_PORT,
  type UberWorkerRuntimeReadinessPort,
} from '../../application/shared/uber-worker-runtime-readiness.port';
import {
  UberOrderActionWorkerAdapter,
  UberWebhookInboxWorkerAdapter,
  type UberWorkerMetrics,
} from './uber-worker.adapters';
import { UberWorkerConfigService } from './uber-worker-config.service';

export type UberWorkerHealthStatus =
  | 'starting'
  | 'ok'
  | 'degraded'
  | 'unhealthy';
export type UberWorkerRuntimeCheckStatus = 'ok' | 'failed';
export type UberWorkerSchedulerStatus =
  | 'starting'
  | 'ok'
  | 'stuck'
  | 'stopping';

export interface UberWorkerReadiness {
  readonly status: 'ok' | 'not_ready';
  readonly checks: Readonly<{
    database: UberWorkerRuntimeCheckStatus;
    scheduler: UberWorkerSchedulerStatus;
  }>;
  readonly thresholds: Readonly<{
    maxPollSilenceMs: number;
    maxInFlightAgeMs: number;
  }>;
}

export interface UberWorkerHealth
  extends Omit<UberWorkerReadiness, 'status'> {
  readonly status: UberWorkerHealthStatus;
  readonly readiness: UberWorkerReadiness['status'];
  readonly degradation: Readonly<{
    durableFailures: Readonly<{
      webhookInbox: number;
      orderAction: number;
    }>;
  }>;
  readonly adapters: Readonly<{
    webhookInbox: Readonly<UberWorkerMetrics>;
    orderAction: Readonly<UberWorkerMetrics>;
  }>;
}

/**
 * Runtime health for the dedicated durable worker process.
 *
 * Readiness is intentionally limited to local runtime dependencies: PostgreSQL,
 * scheduler startup/heartbeat and graceful-shutdown state. Provider/API failures
 * and business backlog remain degraded telemetry and must not eject the worker
 * from runtime readiness.
 */
@Injectable()
export class UberWorkerHealthService implements OnModuleDestroy {
  private stopping = false;

  constructor(
    private readonly webhookInbox: UberWebhookInboxWorkerAdapter,
    private readonly orderAction: UberOrderActionWorkerAdapter,
    private readonly config: UberWorkerConfigService,
    @Inject(UBER_WORKER_RUNTIME_READINESS_PORT)
    private readonly runtimeReadiness: UberWorkerRuntimeReadinessPort,
  ) {}

  onModuleDestroy(): void {
    this.stopping = true;
  }

  async readiness(): Promise<UberWorkerReadiness> {
    const adapters = this.adapterMetrics();
    const databaseReady = await this.runtimeReadiness.probeDatabase();
    return this.buildReadiness(adapters, databaseReady);
  }

  async snapshot(): Promise<UberWorkerHealth> {
    const adapters = this.adapterMetrics();
    const [databaseReady, durableFailures] = await Promise.all([
      this.runtimeReadiness.probeDatabase(),
      this.runtimeReadiness.readDurableFailures(),
    ]);
    const readiness = this.buildReadiness(adapters, databaseReady);

    let status: UberWorkerHealthStatus;
    if (readiness.checks.database === 'failed') {
      status = 'unhealthy';
    } else if (readiness.checks.scheduler === 'starting') {
      status = 'starting';
    } else if (readiness.status !== 'ok') {
      status = 'unhealthy';
    } else if (
      Object.values(adapters).some(
        (adapter) =>
          adapter.lastSuccessfulAt === null ||
          adapter.consecutiveFailures > 0 ||
          adapter.backlog > 0,
      ) ||
      durableFailures.webhookInbox > 0 ||
      durableFailures.orderAction > 0
    ) {
      status = 'degraded';
    } else {
      status = 'ok';
    }

    return {
      status,
      readiness: readiness.status,
      checks: readiness.checks,
      thresholds: readiness.thresholds,
      degradation: {
        durableFailures,
      },
      adapters,
    };
  }

  private adapterMetrics() {
    return {
      webhookInbox: this.webhookInbox.getMetrics(),
      orderAction: this.orderAction.getMetrics(),
    };
  }

  private buildReadiness(
    adapters: ReturnType<UberWorkerHealthService['adapterMetrics']>,
    databaseReady: boolean,
  ): UberWorkerReadiness {
    const thresholds = this.thresholds();
    const scheduler = this.schedulerStatus(
      Object.values(adapters),
      thresholds.maxPollSilenceMs,
    );
    const database: UberWorkerRuntimeCheckStatus = databaseReady
      ? 'ok'
      : 'failed';

    return {
      status: database === 'ok' && scheduler === 'ok' ? 'ok' : 'not_ready',
      checks: {
        database,
        scheduler,
      },
      thresholds,
    };
  }

  private thresholds(): UberWorkerReadiness['thresholds'] {
    const longestScheduledDelayMs = Math.max(
      this.config.workerWakeFallbackPollIntervalMs,
      ...Object.values(this.config.workerPolicies).map(
        (policy) => policy.maxBackoffMs,
      ),
    );
    return {
      maxPollSilenceMs:
        longestScheduledDelayMs * this.config.workerSchedulerSilenceMultiplier,
      maxInFlightAgeMs: this.config.workerMaxPollDurationMs,
    };
  }

  private schedulerStatus(
    metrics: readonly Readonly<UberWorkerMetrics>[],
    maxPollSilenceMs: number,
  ): UberWorkerSchedulerStatus {
    if (this.stopping) return 'stopping';

    const now = Date.now();
    if (
      metrics.some(
        (adapter) =>
          adapter.inFlightStartedAt !== null &&
          now - adapter.inFlightStartedAt.getTime() >
            this.config.workerMaxPollDurationMs,
      )
    ) {
      return 'stuck';
    }
    if (metrics.some((adapter) => adapter.lastAttemptAt === null)) {
      return 'starting';
    }
    if (
      metrics.some(
        (adapter) =>
          adapter.inFlightStartedAt === null &&
          adapter.lastAttemptAt !== null &&
          now - adapter.lastAttemptAt.getTime() > maxPollSilenceMs,
      )
    ) {
      return 'stuck';
    }
    return 'ok';
  }
}
