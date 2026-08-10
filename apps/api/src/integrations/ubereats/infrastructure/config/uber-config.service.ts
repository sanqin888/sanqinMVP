import { Injectable } from '@nestjs/common';

export type UberEnvironment = Record<string, string | undefined>;

export interface UberApiConfig {
  readonly apiBaseUrl: string;
}

export interface UberRateLimitConfig {
  readonly uberApiConcurrencyPerPartition: number;
  readonly uberApiRatePerSecond: number;
  readonly uberApiBurst: number;
  readonly uberApiQueueLengthPerPartition: number;
  readonly uberApiQueueWaitTimeoutMs: number;
  operationWeight(operation: string): number;
}

export interface UberOrderConfig extends UberApiConfig {
  readonly resourceHrefAllowedOrigins: string;
}

export interface UberMenuConfig extends UberApiConfig {
  readonly menuNotificationsEnabled: boolean;
  readonly menuConfirmTimeoutMs: number;
  readonly menuConfirmInitialDelayMs: number;
  readonly menuConfirmMaxDelayMs: number;
}

export interface UberOAuthStateConfig extends UberApiConfig {
  getOAuthStateSecret(): string;
}

export interface UberWebhookConfig {
  getWebhookSigningKey(): string;
}

const MENU_CONFIRM_TIMEOUT_DEFAULT_MS = 120_000;
const MENU_CONFIRM_INITIAL_DELAY_DEFAULT_MS = 1_000;
const MENU_CONFIRM_MAX_DELAY_DEFAULT_MS = 30_000;

/** Immutable, startup-time snapshot of all configuration used by Uber services. */
@Injectable()
export class UberConfigService {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly apiBaseUrl: string;
  private readonly oauthStateSecret: string;
  private readonly webhookSigningKey: string;
  readonly redirectUri: string;
  readonly resourceHrefAllowedOrigins: string;
  readonly tokenEndpoint: string;
  readonly authorizeEndpoint: string;
  readonly defaultAppScopes: string;
  readonly defaultMerchantScopes: string;
  readonly menuNotificationsEnabled: boolean;
  readonly menuConfirmTimeoutMs: number;
  readonly menuConfirmInitialDelayMs: number;
  readonly menuConfirmMaxDelayMs: number;
  readonly uberApiConcurrencyPerPartition: number;
  readonly uberApiRatePerSecond: number;
  readonly uberApiBurst: number;
  readonly uberApiQueueLengthPerPartition: number;
  readonly uberApiQueueWaitTimeoutMs: number;
  private readonly uberApiOperationWeights: Readonly<Record<string, number>>;

  constructor(env: UberEnvironment = process.env) {
    this.clientId = this.read(env, 'UBER_EATS_CLIENT_ID');
    this.clientSecret = this.read(env, 'UBER_EATS_CLIENT_SECRET');
    this.apiBaseUrl = this.read(env, 'UBER_EATS_API_BASE_URL');
    this.oauthStateSecret = this.read(env, 'UBER_EATS_OAUTH_STATE_SECRET');
    this.webhookSigningKey = this.read(env, 'UBER_EATS_WEBHOOK_SIGNING_KEY');
    this.redirectUri = this.read(env, 'UBER_EATS_REDIRECT_URI');
    this.resourceHrefAllowedOrigins = this.read(
      env,
      'UBER_EATS_RESOURCE_HREF_ALLOWED_ORIGINS',
    );
    this.tokenEndpoint =
      this.read(env, 'UBER_EATS_TOKEN_ENDPOINT') ||
      'https://auth.uber.com/oauth/v2/token';
    this.authorizeEndpoint =
      this.read(env, 'UBER_EATS_AUTHORIZE_ENDPOINT') ||
      'https://auth.uber.com/oauth/v2/authorize';
    this.defaultAppScopes =
      this.read(env, 'UBER_EATS_APP_SCOPES') ||
      this.read(env, 'UBER_EATS_SCOPES') ||
      'eats.store eats.order';
    this.defaultMerchantScopes =
      this.read(env, 'UBER_EATS_USER_AUTH_SCOPES') || 'eats.pos_provisioning';
    this.menuNotificationsEnabled = /^(1|true|yes)$/i.test(
      this.read(env, 'UBER_EATS_MENU_NOTIFICATIONS_ENABLED'),
    );

    this.validateHttpUrl('UBER_EATS_API_BASE_URL', this.apiBaseUrl);
    this.validateHttpUrl('UBER_EATS_REDIRECT_URI', this.redirectUri);
    this.validateHttpUrl('UBER_EATS_TOKEN_ENDPOINT', this.tokenEndpoint);
    this.validateHttpUrl(
      'UBER_EATS_AUTHORIZE_ENDPOINT',
      this.authorizeEndpoint,
    );
    for (const origin of this.resourceHrefAllowedOrigins
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)) {
      this.validateHttpUrl(
        'UBER_EATS_RESOURCE_HREF_ALLOWED_ORIGINS',
        origin,
        true,
      );
    }

    this.menuConfirmTimeoutMs = this.readMilliseconds(
      env,
      'UBER_EATS_MENU_CONFIRM_TIMEOUT_MS',
      MENU_CONFIRM_TIMEOUT_DEFAULT_MS,
      100,
      600_000,
    );
    this.menuConfirmInitialDelayMs = this.readMilliseconds(
      env,
      'UBER_EATS_MENU_CONFIRM_INITIAL_DELAY_MS',
      MENU_CONFIRM_INITIAL_DELAY_DEFAULT_MS,
      10,
      60_000,
    );
    const configuredMaxDelay = this.readMilliseconds(
      env,
      'UBER_EATS_MENU_CONFIRM_MAX_DELAY_MS',
      MENU_CONFIRM_MAX_DELAY_DEFAULT_MS,
      10,
      60_000,
    );

    if (this.menuConfirmInitialDelayMs > this.menuConfirmTimeoutMs) {
      throw new Error(
        'Uber 配置 UBER_EATS_MENU_CONFIRM_INITIAL_DELAY_MS 不得大于 UBER_EATS_MENU_CONFIRM_TIMEOUT_MS',
      );
    }
    this.menuConfirmMaxDelayMs = Math.min(
      configuredMaxDelay,
      this.menuConfirmTimeoutMs,
    );

    this.uberApiConcurrencyPerPartition = this.readInteger(
      env,
      'UBER_EATS_API_CONCURRENCY_PER_PARTITION',
      4,
      1,
      50,
    );
    this.uberApiRatePerSecond = this.readInteger(
      env,
      'UBER_EATS_API_RATE_PER_SECOND',
      20,
      1,
      10_000,
    );
    this.uberApiBurst = this.readInteger(
      env,
      'UBER_EATS_API_BURST',
      40,
      1,
      10_000,
    );
    this.uberApiQueueLengthPerPartition = this.readInteger(
      env,
      'UBER_EATS_API_QUEUE_LENGTH_PER_PARTITION',
      100,
      0,
      100_000,
    );
    this.uberApiQueueWaitTimeoutMs = this.readInteger(
      env,
      'UBER_EATS_API_QUEUE_WAIT_TIMEOUT_MS',
      5_000,
      1,
      300_000,
    );
    this.uberApiOperationWeights = this.readOperationWeights(env);
  }

  operationWeight(operation: string): number {
    return this.uberApiOperationWeights[operation] ?? 1;
  }

  /** Read only at the OAuth state creation/consumption capability boundary. */
  getOAuthStateSecret(): string {
    if (
      this.oauthStateSecret.length < 32 ||
      new Set(this.oauthStateSecret).size < 12
    ) {
      throw new Error(
        'Uber 配置 UBER_EATS_OAUTH_STATE_SECRET 必须是至少 32 个字符的高熵密钥',
      );
    }
    return this.oauthStateSecret;
  }

  /** Read only by the webhook signature verification capability. */
  getWebhookSigningKey(): string {
    if (!this.webhookSigningKey) {
      throw new Error('Uber 配置 UBER_EATS_WEBHOOK_SIGNING_KEY 未配置');
    }
    return this.webhookSigningKey;
  }

  private read(env: UberEnvironment, key: string): string {
    return env[key]?.trim() || '';
  }

  private readMilliseconds(
    env: UberEnvironment,
    key: string,
    defaultValue: number,
    minimum: number,
    maximum: number,
  ): number {
    const raw = env[key];
    if (raw === undefined) return defaultValue;
    if (!raw.trim()) {
      throw new Error(`Uber 配置 ${key} 必须是有限整数`);
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error(`Uber 配置 ${key} 必须是有限整数`);
    }
    if (value < minimum || value > maximum) {
      throw new Error(
        `Uber 配置 ${key} 必须在 ${minimum} 到 ${maximum} 毫秒之间`,
      );
    }
    return value;
  }

  private readInteger(
    env: UberEnvironment,
    key: string,
    defaultValue: number,
    minimum: number,
    maximum: number,
  ): number {
    const raw = env[key];
    if (raw === undefined) return defaultValue;
    const value = Number(raw);
    if (
      !raw.trim() ||
      !Number.isInteger(value) ||
      value < minimum ||
      value > maximum
    ) {
      throw new Error(
        `Uber 配置 ${key} 必须是 ${minimum} 到 ${maximum} 之间的整数`,
      );
    }
    return value;
  }

  private readOperationWeights(
    env: UberEnvironment,
  ): Readonly<Record<string, number>> {
    const raw = this.read(env, 'UBER_EATS_API_OPERATION_WEIGHTS');
    if (!raw) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
        throw new Error();
      for (const [operation, weight] of Object.entries(parsed)) {
        if (
          !operation ||
          !Number.isInteger(weight) ||
          (weight as number) < 1 ||
          (weight as number) > 10_000
        )
          throw new Error();
      }
      return Object.freeze(parsed as Record<string, number>);
    } catch {
      throw new Error(
        'Uber 配置 UBER_EATS_API_OPERATION_WEIGHTS 必须是值为正整数的 JSON 对象',
      );
    }
  }

  private validateHttpUrl(
    key: string,
    value: string,
    originOnly = false,
  ): void {
    if (!value) return;
    try {
      const url = new URL(value);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        (originOnly && url.origin !== value.replace(/\/$/, ''))
      ) {
        throw new Error('invalid URL');
      }
    } catch {
      throw new Error(`Uber 配置 ${key} 必须是有效的 HTTP(S) URL`);
    }
  }
}
