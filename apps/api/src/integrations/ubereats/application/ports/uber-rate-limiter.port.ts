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
  release(): void;
  feedback(value: UberRateLimitFeedback): void;
}

/** Application boundary; implementations may coordinate one process or a cluster. */
export interface UberRateLimiterPort {
  acquire(request: UberRateLimitRequest): Promise<UberRateLimitLease>;
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
