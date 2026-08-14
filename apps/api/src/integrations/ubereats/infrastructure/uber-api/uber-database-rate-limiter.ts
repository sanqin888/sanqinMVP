import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { UberRateLimitConfig } from './uber-api-config.service';
import {
  UberRateLimitRejectedError,
  type UberRateLimitCoordinationRepositoryPort,
  type UberRateLimitLease,
  type UberRateLimiterMetricsPort,
  type UberRateLimiterPort,
  type UberRateLimitRequest,
} from '../../application/shared/uber-rate-limiter.port';

/** PostgreSQL-coordinated token bucket, concurrency leases and 429 cooldown. */
@Injectable()
export class DatabaseUberRateLimiter implements UberRateLimiterPort {
  private readonly queued = new Map<string, number>();

  constructor(
    private readonly config: UberRateLimitConfig,
    private readonly repository: UberRateLimitCoordinationRepositoryPort,
    private readonly metrics?: UberRateLimiterMetricsPort,
    private readonly leaseMs = 30_000,
  ) {}

  async acquire(request: UberRateLimitRequest): Promise<UberRateLimitLease> {
    const started = Date.now();
    const depth = this.queued.get(request.partitionKey) ?? 0;
    if (depth >= this.config.uberApiQueueLengthPerPartition)
      return this.reject('queue_full', request);
    this.setDepth(request, depth + 1);
    try {
      while (Date.now() - started < this.config.uberApiQueueWaitTimeoutMs) {
        const now = new Date();
        const id = randomUUID();
        const result = await this.repository.tryAcquire({
          partitionKey: request.partitionKey,
          leaseId: id,
          now,
          leaseExpiresAt: new Date(now.getTime() + this.leaseMs),
          ratePerSecond: this.config.uberApiRatePerSecond,
          burst: this.config.uberApiBurst,
          concurrencyLimit: this.config.uberApiConcurrencyPerPartition,
          weight: request.weight,
        });
        if (result.acquired) {
          this.metrics?.observe(
            'ubereats_rate_limit_wait_ms',
            Date.now() - started,
            { operation: request.operation },
          );
          return this.lease(request, id);
        }
        const remaining =
          this.config.uberApiQueueWaitTimeoutMs - (Date.now() - started);
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.max(1, Math.min(100, result.retryAfterMs || 25, remaining)),
          ),
        );
      }
      return this.reject('wait_timeout', request);
    } finally {
      this.setDepth(request, (this.queued.get(request.partitionKey) ?? 1) - 1);
    }
  }

  private lease(request: UberRateLimitRequest, id: string): UberRateLimitLease {
    let released = false;
    return {
      release: async () => {
        if (!released) {
          released = true;
          await this.repository.release(id);
        }
      },
      feedback: async ({ status, retryAfter }) => {
        if (status !== 429) return;
        this.metrics?.increment('ubereats_api_429_total', {
          operation: request.operation,
        });
        await this.repository.extendCooldown(
          request.partitionKey,
          new Date(Date.now() + this.retryAfterMs(retryAfter)),
        );
      },
    };
  }

  private reject(
    reason: 'queue_full' | 'wait_timeout',
    request: UberRateLimitRequest,
  ): never {
    this.metrics?.increment('ubereats_rate_limit_rejected_total', {
      operation: request.operation,
      reason,
    });
    throw new UberRateLimitRejectedError(reason, request.partitionKey);
  }

  private setDepth(request: UberRateLimitRequest, value: number): void {
    const depth = Math.max(0, value);
    this.queued.set(request.partitionKey, depth);
    this.metrics?.gauge('ubereats_rate_limit_queue_depth', depth, {
      operation: request.operation,
    });
  }

  private retryAfterMs(value: string | null): number {
    if (!value) return 1_000;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
    const date = Date.parse(value);
    return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 1_000;
  }
}
