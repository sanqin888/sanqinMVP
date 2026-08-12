import { Inject, Injectable } from '@nestjs/common';
import type { UberRateLimitConfig } from './uber-api-config.service';
import { UberApiConfigService } from './uber-api-config.service';
import {
  UberRateLimitRejectedError,
  type UberRateLimitLease,
  type UberRateLimiterPort,
  type UberRateLimitRequest,
} from '../../application/ports/uber-rate-limiter.port';
export * from '../../application/ports/uber-rate-limiter.port';

type Waiter = {
  request: UberRateLimitRequest;
  enqueuedAt: number;
  resolve: (lease: UberRateLimitLease) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};
type Partition = {
  active: number;
  tokens: number;
  updatedAt: number;
  cooldownUntil: number;
  queue: Waiter[];
  wakeup?: ReturnType<typeof setTimeout>;
};

/**
 * Process-local token bucket. Deployment constraint: quotas are not shared across
 * replicas. Until a shared atomic quota coordinator is available, configure the
 * upstream quota divided by replica count; overload is rejected by bounded queue.
 */
@Injectable()
export class ProcessUberRateLimiter implements UberRateLimiterPort {
  private readonly partitions = new Map<string, Partition>();
  constructor(
    @Inject(UberApiConfigService) private readonly config: UberRateLimitConfig,
    private readonly metrics?: {
      increment(
        name: 'ubereats_rate_limit_rejected_total' | 'ubereats_api_429_total',
        labels?: Record<string, string>,
      ): void;
      observe(
        name: 'ubereats_rate_limit_wait_ms',
        value: number,
        labels?: Record<string, string>,
      ): void;
      gauge(
        name: 'ubereats_rate_limit_queue_depth',
        value: number,
        labels?: Record<string, string>,
      ): void;
    },
  ) {}

  acquire(request: UberRateLimitRequest): Promise<UberRateLimitLease> {
    const state = this.state(request.partitionKey);
    this.refill(state);
    if (this.canRun(state, request.weight))
      return Promise.resolve(this.grant(state, request));
    if (state.queue.length >= this.config.uberApiQueueLengthPerPartition) {
      this.metrics?.increment('ubereats_rate_limit_rejected_total', {
        operation: request.operation,
        reason: 'queue_full',
      });
      return Promise.reject(
        new UberRateLimitRejectedError('queue_full', request.partitionKey),
      );
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        request,
        enqueuedAt: Date.now(),
        resolve,
        reject,
        timeout: setTimeout(() => {
          const index = state.queue.indexOf(waiter);
          if (index >= 0) state.queue.splice(index, 1);
          this.metrics?.gauge(
            'ubereats_rate_limit_queue_depth',
            state.queue.length,
            { operation: request.operation },
          );
          this.metrics?.increment('ubereats_rate_limit_rejected_total', {
            operation: request.operation,
            reason: 'wait_timeout',
          });
          reject(
            new UberRateLimitRejectedError(
              'wait_timeout',
              request.partitionKey,
            ),
          );
          this.schedule(state);
        }, this.config.uberApiQueueWaitTimeoutMs),
      };
      state.queue.push(waiter);
      this.metrics?.gauge(
        'ubereats_rate_limit_queue_depth',
        state.queue.length,
        { operation: request.operation },
      );
      this.schedule(state);
    });
  }

  private state(key: string): Partition {
    let state = this.partitions.get(key);
    if (!state) {
      state = {
        active: 0,
        tokens: this.config.uberApiBurst,
        updatedAt: Date.now(),
        cooldownUntil: 0,
        queue: [],
      };
      this.partitions.set(key, state);
    }
    return state;
  }
  private refill(state: Partition): void {
    const now = Date.now();
    state.tokens = Math.min(
      this.config.uberApiBurst,
      state.tokens +
        ((now - state.updatedAt) / 1000) * this.config.uberApiRatePerSecond,
    );
    state.updatedAt = now;
  }
  private canRun(state: Partition, weight: number): boolean {
    return (
      state.active < this.config.uberApiConcurrencyPerPartition &&
      state.tokens >= weight &&
      Date.now() >= state.cooldownUntil
    );
  }
  private grant(
    state: Partition,
    request: UberRateLimitRequest,
  ): UberRateLimitLease {
    state.tokens -= request.weight;
    state.active += 1;
    let released = false;
    return {
      release: () => {
        if (!released) {
          released = true;
          state.active -= 1;
          this.drain(state);
        }
      },
      feedback: ({ status, retryAfter }) => {
        if (status !== 429) return;
        this.metrics?.increment('ubereats_api_429_total', {
          operation: request.operation,
        });
        state.cooldownUntil = Math.max(
          state.cooldownUntil,
          Date.now() + this.retryAfterMs(retryAfter),
        );
        this.schedule(state);
      },
    };
  }
  private drain(state: Partition): void {
    this.refill(state);
    while (
      state.queue.length &&
      this.canRun(state, state.queue[0].request.weight)
    ) {
      const waiter = state.queue.shift()!;
      clearTimeout(waiter.timeout);
      this.metrics?.gauge(
        'ubereats_rate_limit_queue_depth',
        state.queue.length,
        { operation: waiter.request.operation },
      );
      this.metrics?.observe(
        'ubereats_rate_limit_wait_ms',
        Date.now() - waiter.enqueuedAt,
        { operation: waiter.request.operation },
      );
      waiter.resolve(this.grant(state, waiter.request));
    }
    this.schedule(state);
  }
  private schedule(state: Partition): void {
    if (state.wakeup) clearTimeout(state.wakeup);
    if (
      !state.queue.length ||
      state.active >= this.config.uberApiConcurrencyPerPartition
    )
      return;
    const tokenDelay = Math.max(
      0,
      ((state.queue[0].request.weight - state.tokens) /
        this.config.uberApiRatePerSecond) *
        1000,
    );
    const delay = Math.max(1, tokenDelay, state.cooldownUntil - Date.now());
    state.wakeup = setTimeout(() => this.drain(state), delay);
  }
  private retryAfterMs(value: string | null): number {
    if (!value) return 1_000;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(value);
    return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 1_000;
  }
}
