import { Injectable } from '@nestjs/common';

export type UberWorkerKind = 'webhookInbox' | 'orderAction';

export interface UberWorkerPolicy {
  readonly concurrency: number;
  readonly initialBackoffMs: number;
  readonly maxBackoffMs: number;
}

/** Startup-time snapshot containing only durable-worker runtime settings. */
@Injectable()
export class UberWorkerConfigService {
  readonly workerEnabled: boolean;
  readonly workerWakeFallbackPollIntervalMs: number;
  readonly workerWakeBaseUrl: string | null;
  readonly workerWakeTimeoutMs: number;
  readonly workerBatchSize: number;
  readonly workerLeaseDurationMs: number;
  readonly workerShutdownTimeoutMs: number;
  readonly workerUnhealthyFailureThreshold: number;
  readonly workerPolicies: Readonly<Record<UberWorkerKind, UberWorkerPolicy>>;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.workerEnabled = /^(1|true|yes)$/i.test(
      this.read(env, 'UBER_EATS_WORKER_ENABLED'),
    );
    this.workerWakeFallbackPollIntervalMs = this.milliseconds(
      env,
      'UBER_EATS_WORKER_WAKE_FALLBACK_POLL_INTERVAL_MS',
      30_000,
      10,
      3_600_000,
    );
    this.workerWakeBaseUrl = this.optionalHttpUrl(
      env,
      'UBER_EATS_WORKER_WAKE_URL',
    );
    this.workerWakeTimeoutMs = this.milliseconds(
      env,
      'UBER_EATS_WORKER_WAKE_TIMEOUT_MS',
      500,
      50,
      10_000,
    );
    this.workerBatchSize = this.integer(
      env,
      'UBER_EATS_WORKER_BATCH_SIZE',
      50,
      1,
      10_000,
    );
    this.workerLeaseDurationMs = this.milliseconds(
      env,
      'UBER_EATS_WORKER_LEASE_DURATION_MS',
      60_000,
      100,
      3_600_000,
    );
    this.workerShutdownTimeoutMs = this.milliseconds(
      env,
      'UBER_EATS_WORKER_SHUTDOWN_TIMEOUT_MS',
      30_000,
      100,
      600_000,
    );
    this.workerUnhealthyFailureThreshold = this.integer(
      env,
      'UBER_EATS_WORKER_UNHEALTHY_FAILURE_THRESHOLD',
      3,
      1,
      100,
    );
    this.workerPolicies = Object.freeze({
      webhookInbox: this.policy(env, 'WEBHOOK_INBOX'),
      orderAction: this.policy(env, 'ORDER_ACTION'),
    });
    this.validateLeaseBudget(env);
  }

  private validateLeaseBudget(env: Record<string, string | undefined>): void {
    const attempts = this.integer(env, 'UBER_EATS_HTTP_MAX_ATTEMPTS', 3, 1, 5);
    const retryDelay = this.milliseconds(
      env,
      'UBER_EATS_HTTP_MAX_RETRY_DELAY_MS',
      2_000,
      50,
      30_000,
    );
    const longestRequest = Math.max(
      this.milliseconds(
        env,
        'UBER_EATS_TOKEN_TIMEOUT_MS',
        10_000,
        100,
        120_000,
      ),
      this.milliseconds(env, 'UBER_EATS_API_TIMEOUT_MS', 10_000, 100, 120_000),
      this.milliseconds(
        env,
        'UBER_EATS_ORDER_DETAIL_TIMEOUT_MS',
        15_000,
        100,
        120_000,
      ),
    );
    const worstCaseMs = attempts * longestRequest + (attempts - 1) * retryDelay;
    if (worstCaseMs >= this.workerLeaseDurationMs)
      throw new Error(
        `Uber worker lease ${this.workerLeaseDurationMs}ms 必须大于 HTTP 最坏尝试预算 ${worstCaseMs}ms`,
      );
    if (this.workerBatchSize < this.workerPolicies.webhookInbox.concurrency)
      throw new Error(
        'UBER_EATS_WORKER_BATCH_SIZE 不得小于 WEBHOOK_INBOX worker concurrency',
      );
  }

  private policy(
    env: Record<string, string | undefined>,
    name: string,
  ): UberWorkerPolicy {
    const prefix = `UBER_EATS_${name}_WORKER`;
    const initialBackoffMs = this.milliseconds(
      env,
      `${prefix}_INITIAL_BACKOFF_MS`,
      1_000,
      10,
      600_000,
    );
    const maxBackoffMs = this.milliseconds(
      env,
      `${prefix}_MAX_BACKOFF_MS`,
      60_000,
      10,
      3_600_000,
    );
    if (initialBackoffMs > maxBackoffMs)
      throw new Error(
        `Uber 配置 ${prefix}_INITIAL_BACKOFF_MS 不得大于 ${prefix}_MAX_BACKOFF_MS`,
      );
    return Object.freeze({
      concurrency: this.integer(env, `${prefix}_CONCURRENCY`, 1, 1, 100),
      initialBackoffMs,
      maxBackoffMs,
    });
  }

  private read(env: Record<string, string | undefined>, key: string): string {
    return env[key]?.trim() || '';
  }

  private optionalHttpUrl(
    env: Record<string, string | undefined>,
    key: string,
  ): string | null {
    const raw = this.read(env, key);
    if (!raw) return null;
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error(`Uber 配置 ${key} 必须是有效 URL`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Uber 配置 ${key} 只允许 http/https URL`);
    }
    parsed.search = '';
    parsed.hash = '';
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString().replace(/\/$/, '');
  }

  private milliseconds(
    env: Record<string, string | undefined>,
    key: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const raw = env[key];
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!raw.trim() || !Number.isInteger(value))
      throw new Error(`Uber 配置 ${key} 必须是有限整数`);
    if (value < min || value > max)
      throw new Error(`Uber 配置 ${key} 必须在 ${min} 到 ${max} 毫秒之间`);
    return value;
  }
  private integer(
    env: Record<string, string | undefined>,
    key: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const raw = env[key];
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!raw.trim() || !Number.isInteger(value) || value < min || value > max)
      throw new Error(`Uber 配置 ${key} 必须是 ${min} 到 ${max} 之间的整数`);
    return value;
  }
}
