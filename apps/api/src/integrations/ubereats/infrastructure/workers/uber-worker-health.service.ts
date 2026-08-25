import { Injectable, type OnModuleDestroy } from '@nestjs/common';

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

export interface UberWorkerHealth {
  readonly status: UberWorkerHealthStatus;
  readonly thresholds: Readonly<{
    consecutiveFailures: number;
    lastSuccessAgeMs: number;
  }>;
  readonly adapters: Readonly<{
    webhookInbox: Readonly<UberWorkerMetrics>;
    orderAction: Readonly<UberWorkerMetrics>;
  }>;
}

/** Dependency-free health snapshot consumed by the worker's private health server. */
@Injectable()
export class UberWorkerHealthService implements OnModuleDestroy {
  private stopping = false;

  constructor(
    private readonly webhookInbox: UberWebhookInboxWorkerAdapter,
    private readonly orderAction: UberOrderActionWorkerAdapter,
    private readonly config: UberWorkerConfigService,
  ) {}

  onModuleDestroy(): void {
    this.stopping = true;
  }

  snapshot(): UberWorkerHealth {
    const adapters = {
      webhookInbox: this.webhookInbox.getMetrics(),
      orderAction: this.orderAction.getMetrics(),
    };
    const metrics = Object.values(adapters);
    const lastSuccessAgeMs =
      this.config.workerWakeFallbackPollIntervalMs *
      this.config.workerUnhealthyFailureThreshold;
    const now = Date.now();
    let status: UberWorkerHealthStatus;
    if (this.stopping) {
      status = 'unhealthy';
    } else if (
      metrics.some(
        (adapter) =>
          adapter.consecutiveFailures >=
            this.config.workerUnhealthyFailureThreshold ||
          (adapter.lastSuccessfulAt !== null &&
            now - adapter.lastSuccessfulAt.getTime() > lastSuccessAgeMs),
      )
    ) {
      status = 'unhealthy';
    } else if (metrics.some((adapter) => adapter.lastAttemptAt === null)) {
      status = 'starting';
    } else if (
      metrics.some(
        (adapter) =>
          adapter.lastSuccessfulAt === null ||
          adapter.consecutiveFailures > 0 ||
          adapter.backlog > 0,
      )
    ) {
      status = 'degraded';
    } else {
      status = 'ok';
    }
    return {
      status,
      thresholds: {
        consecutiveFailures: this.config.workerUnhealthyFailureThreshold,
        lastSuccessAgeMs,
      },
      adapters,
    };
  }
}
