export const UBER_RATE_LIMITER_PORT = Symbol('UBER_RATE_LIMITER_PORT');

export type UberRateLimitRequest = {
  partitionKey: string;
  operation: string;
  weight: number;
};

export type UberRateLimitFeedback = {
  status: number;
  retryAfter: string | null;
};

export interface UberRateLimitLease {
  release(): Promise<void>;
  feedback(value: UberRateLimitFeedback): Promise<void>;
}

/** Application boundary; implementations may coordinate one process or a cluster. */
export interface UberRateLimiterPort {
  acquire(request: UberRateLimitRequest): Promise<UberRateLimitLease>;
}

export type UberRateLimitAcquireCommand = {
  partitionKey: string;
  leaseId: string;
  now: Date;
  leaseExpiresAt: Date;
  ratePerSecond: number;
  burst: number;
  concurrencyLimit: number;
  weight: number;
};

export type UberRateLimitAcquireResult =
  | { acquired: true }
  | { acquired: false; retryAfterMs: number };

/** Persistence boundary for atomic, cross-process quota coordination. */
export interface UberRateLimitCoordinationRepositoryPort {
  tryAcquire(
    command: UberRateLimitAcquireCommand,
  ): Promise<UberRateLimitAcquireResult>;
  release(leaseId: string): Promise<void>;
  extendCooldown(partitionKey: string, cooldownUntil: Date): Promise<void>;
}

/** Metrics required by rate-limiter adapters, independent of persistence. */
export interface UberRateLimiterMetricsPort {
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
}

export class UberRateLimitRejectedError extends Error {
  constructor(
    readonly reason: 'queue_full' | 'wait_timeout',
    partition: string,
  ) {
    super(
      `Uber API 限流器拒绝请求（reason=${reason}, partition=${partition}）`,
    );
    this.name = 'UberRateLimitRejectedError';
  }
}
