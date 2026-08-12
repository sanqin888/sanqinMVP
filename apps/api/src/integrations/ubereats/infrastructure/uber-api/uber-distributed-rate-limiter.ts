import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { UberRateLimitConfig } from './uber-api-config.service';
import {
  UberRateLimitRejectedError,
  type UberRateLimitLease,
  type UberRateLimiterPort,
  type UberRateLimitRequest,
} from '../../application/shared/uber-rate-limiter.port';

export interface UberAtomicCommandStore {
  eval(
    script: string,
    keys: string[],
    args: Array<string | number>,
  ): Promise<unknown>;
}

export interface UberRateLimiterMetrics {
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

/** Dependency-free adapter for Redis-compatible HTTP APIs (including Upstash). */
export class RedisHttpAtomicCommandStore implements UberAtomicCommandStore {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  async eval(
    script: string,
    keys: string[],
    args: Array<string | number>,
  ): Promise<unknown> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(['EVAL', script, keys.length, ...keys, ...args]),
    });
    if (!response.ok)
      throw new Error(`Redis 限流协调器请求失败（status=${response.status}）`);
    const body = (await response.json()) as {
      result?: unknown;
      error?: string;
    };
    if (body.error) throw new Error(`Redis 限流协调器执行失败：${body.error}`);
    return body.result;
  }
}

const ACQUIRE = `
local now=tonumber(ARGV[1]); local rate=tonumber(ARGV[2]); local burst=tonumber(ARGV[3])
local maxActive=tonumber(ARGV[4]); local weight=tonumber(ARGV[5]); local lease=ARGV[6]; local expiry=tonumber(ARGV[7])
local expired=redis.call('ZRANGEBYSCORE',KEYS[2],'-inf',now)
if #expired>0 then redis.call('ZREM',KEYS[2],unpack(expired)) end
local active=redis.call('ZCARD',KEYS[2]); local data=redis.call('HMGET',KEYS[1],'tokens','updated','cooldown')
local tokens=tonumber(data[1]) or burst; local updated=tonumber(data[2]) or now; local cooldown=tonumber(data[3]) or 0
tokens=math.min(burst,tokens+math.max(0,now-updated)*rate/1000)
if now<cooldown or active>=maxActive or tokens<weight then
 redis.call('HMSET',KEYS[1],'tokens',tokens,'updated',now,'cooldown',cooldown); redis.call('PEXPIRE',KEYS[1],86400000)
 return {0,math.max(cooldown-now,math.ceil(math.max(0,weight-tokens)*1000/rate)),active}
end
redis.call('HMSET',KEYS[1],'tokens',tokens-weight,'updated',now,'cooldown',cooldown); redis.call('PEXPIRE',KEYS[1],86400000)
redis.call('ZADD',KEYS[2],expiry,lease); redis.call('PEXPIRE',KEYS[2],86400000); return {1,0,active+1}`;
const RELEASE = `redis.call('ZREM',KEYS[1],ARGV[1]); return 1`;
const COOLDOWN = `local old=tonumber(redis.call('HGET',KEYS[1],'cooldown')) or 0; local untilAt=tonumber(ARGV[1]); if untilAt>old then redis.call('HSET',KEYS[1],'cooldown',untilAt) end; redis.call('PEXPIRE',KEYS[1],86400000); return math.max(old,untilAt)`;

/** Cluster-wide token bucket, concurrency leases and Retry-After cooldown. */
@Injectable()
export class DistributedUberRateLimiter implements UberRateLimiterPort {
  private readonly queued = new Map<string, number>();
  constructor(
    private readonly config: UberRateLimitConfig,
    private readonly store: UberAtomicCommandStore,
    private readonly metrics?: UberRateLimiterMetrics,
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
        const id = randomUUID();
        const now = Date.now();
        const result = (await this.store.eval(ACQUIRE, this.keys(request), [
          now,
          this.config.uberApiRatePerSecond,
          this.config.uberApiBurst,
          this.config.uberApiConcurrencyPerPartition,
          request.weight,
          id,
          now + this.leaseMs,
        ])) as number[];
        if (Number(result[0]) === 1) {
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
            Math.max(1, Math.min(100, Number(result[1]) || 25, remaining)),
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
      release: () => {
        if (!released) {
          released = true;
          void this.store.eval(RELEASE, [this.keys(request)[1]], [id]);
        }
      },
      feedback: ({ status, retryAfter }) => {
        if (status !== 429) return;
        this.metrics?.increment('ubereats_api_429_total', {
          operation: request.operation,
        });
        void this.store.eval(
          COOLDOWN,
          [this.keys(request)[0]],
          [Date.now() + this.retryAfterMs(retryAfter)],
        );
      },
    };
  }

  private keys(request: UberRateLimitRequest): [string, string] {
    const encoded = Buffer.from(request.partitionKey).toString('base64url');
    return [
      `ubereats:limit:{${encoded}}:state`,
      `ubereats:limit:{${encoded}}:leases`,
    ];
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
