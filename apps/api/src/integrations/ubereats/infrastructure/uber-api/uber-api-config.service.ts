import { Injectable } from '@nestjs/common';
import {
  isUberClientCredentialsScope,
  isUberMerchantAuthorizationScope,
  UBER_MERCHANT_AUTHORIZATION_SCOPES,
  UBER_REQUIRED_CLIENT_CREDENTIAL_SCOPES,
} from './uber-scopes';

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

/** Uber transport URLs, public OAuth credentials and API throttling settings. */
@Injectable()
export class UberApiConfigService {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly apiBaseUrl: string;
  readonly redirectUri: string;
  readonly resourceHrefAllowedOrigins: string;
  readonly tokenEndpoint: string;
  readonly authorizeEndpoint: string;
  /** Deployment-declared client_credentials entitlements expected to be available. */
  readonly expectedAppScopes: string;
  /** authorization_code scopes requested during merchant provisioning OAuth. */
  readonly merchantAuthorizationScopes: string;
  readonly menuNotificationsEnabled: boolean;
  readonly menuConfirmTimeoutMs: number;
  readonly menuConfirmInitialDelayMs: number;
  readonly menuConfirmMaxDelayMs: number;
  readonly uberApiConcurrencyPerPartition: number;
  readonly uberApiRatePerSecond: number;
  readonly uberApiBurst: number;
  readonly uberApiQueueLengthPerPartition: number;
  readonly uberApiQueueWaitTimeoutMs: number;
  private readonly weights: Readonly<Record<string, number>>;

  constructor(env: Record<string, string | undefined> = process.env) {
    const read = (key: string) => env[key]?.trim() || '';
    this.clientId = read('UBER_EATS_CLIENT_ID');
    this.clientSecret = read('UBER_EATS_CLIENT_SECRET');
    this.apiBaseUrl = read('UBER_EATS_API_BASE_URL');
    this.redirectUri = read('UBER_EATS_REDIRECT_URI');
    this.resourceHrefAllowedOrigins = read(
      'UBER_EATS_RESOURCE_HREF_ALLOWED_ORIGINS',
    );
    this.tokenEndpoint =
      read('UBER_EATS_TOKEN_ENDPOINT') ||
      'https://auth.uber.com/oauth/v2/token';
    this.authorizeEndpoint =
      read('UBER_EATS_AUTHORIZE_ENDPOINT') ||
      'https://auth.uber.com/oauth/v2/authorize';
    this.expectedAppScopes = this.clientCredentialsScopes(
      read('UBER_EATS_APP_SCOPES') ||
        UBER_REQUIRED_CLIENT_CREDENTIAL_SCOPES.join(' '),
    );
    this.merchantAuthorizationScopes = this.merchantAuthorizationScopeList(
      read('UBER_EATS_USER_AUTH_SCOPES') ||
        UBER_MERCHANT_AUTHORIZATION_SCOPES.POS_PROVISIONING,
    );
    this.menuNotificationsEnabled = /^(1|true|yes)$/i.test(
      read('UBER_EATS_MENU_NOTIFICATIONS_ENABLED'),
    );
    this.menuConfirmTimeoutMs = this.integer(
      env,
      'UBER_EATS_MENU_CONFIRM_TIMEOUT_MS',
      120_000,
      100,
      600_000,
    );
    this.menuConfirmInitialDelayMs = this.integer(
      env,
      'UBER_EATS_MENU_CONFIRM_INITIAL_DELAY_MS',
      1_000,
      10,
      60_000,
    );
    if (this.menuConfirmInitialDelayMs > this.menuConfirmTimeoutMs)
      throw new Error(
        'Uber 配置 UBER_EATS_MENU_CONFIRM_INITIAL_DELAY_MS 不得大于 UBER_EATS_MENU_CONFIRM_TIMEOUT_MS',
      );
    this.menuConfirmMaxDelayMs = Math.min(
      this.integer(
        env,
        'UBER_EATS_MENU_CONFIRM_MAX_DELAY_MS',
        30_000,
        10,
        60_000,
      ),
      this.menuConfirmTimeoutMs,
    );
    this.uberApiConcurrencyPerPartition = this.integer(
      env,
      'UBER_EATS_API_CONCURRENCY_PER_PARTITION',
      4,
      1,
      50,
    );
    this.uberApiRatePerSecond = this.integer(
      env,
      'UBER_EATS_API_RATE_PER_SECOND',
      20,
      1,
      10_000,
    );
    this.uberApiBurst = this.integer(env, 'UBER_EATS_API_BURST', 40, 1, 10_000);
    this.uberApiQueueLengthPerPartition = this.integer(
      env,
      'UBER_EATS_API_QUEUE_LENGTH_PER_PARTITION',
      100,
      0,
      100_000,
    );
    this.uberApiQueueWaitTimeoutMs = this.integer(
      env,
      'UBER_EATS_API_QUEUE_WAIT_TIMEOUT_MS',
      5_000,
      1,
      300_000,
    );
    this.weights = this.operationWeights(
      read('UBER_EATS_API_OPERATION_WEIGHTS'),
    );
    for (const [key, value, originOnly] of [
      ['UBER_EATS_API_BASE_URL', this.apiBaseUrl, false],
      ['UBER_EATS_REDIRECT_URI', this.redirectUri, false],
      ['UBER_EATS_TOKEN_ENDPOINT', this.tokenEndpoint, false],
      ['UBER_EATS_AUTHORIZE_ENDPOINT', this.authorizeEndpoint, false],
    ] as const)
      this.validateUrl(key, value, originOnly);
    for (const origin of this.resourceHrefAllowedOrigins
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean))
      this.validateUrl('UBER_EATS_RESOURCE_HREF_ALLOWED_ORIGINS', origin, true);
  }

  operationWeight(operation: string): number {
    return this.weights[operation] ?? 1;
  }

  private clientCredentialsScopes(raw: string): string {
    const scopes = this.scopeList(
      raw,
      'UBER_EATS_APP_SCOPES',
      isUberClientCredentialsScope,
    );
    const missing = UBER_REQUIRED_CLIENT_CREDENTIAL_SCOPES.filter(
      (required) => !scopes.includes(required),
    );
    if (missing.length)
      throw new Error(
        `Uber 配置 UBER_EATS_APP_SCOPES 缺少当前运行时必需 scope: ${missing.join(', ')}`,
      );
    return scopes.join(' ');
  }

  private merchantAuthorizationScopeList(raw: string): string {
    return this.scopeList(
      raw,
      'UBER_EATS_USER_AUTH_SCOPES',
      isUberMerchantAuthorizationScope,
    ).join(' ');
  }

  private scopeList<T extends string>(
    raw: string,
    key: string,
    accepts: (value: string) => value is T,
  ): T[] {
    const scopes = Array.from(
      new Set(
        raw
          .split(/\s+/)
          .map((scope) => scope.trim())
          .filter(Boolean),
      ),
    );
    if (!scopes.length) throw new Error(`Uber 配置 ${key} 不能为空`);
    const invalid = scopes.filter((scope) => !accepts(scope));
    if (invalid.length)
      throw new Error(
        `Uber 配置 ${key} 包含不属于该 OAuth grant type 的 scope: ${invalid.join(', ')}`,
      );
    return scopes.filter(accepts);
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
  private operationWeights(raw: string): Readonly<Record<string, number>> {
    const defaults = {
      'uber.oauth.token': 1,
      'uber.order.accept': 1,
      'uber.order.deny': 1,
      'uber.order.ready_for_pickup': 1,
      'uber.order.detail': 1,
      'uber.menu.upload': 10,
      'uber.menu.read': 1,
      'uber.store.list': 1,
      'uber.store.status': 1,
    };
    if (!raw) return Object.freeze(defaults);
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
        throw new Error();
      for (const [key, value] of Object.entries(parsed))
        if (
          !key ||
          !Number.isInteger(value) ||
          (value as number) < 1 ||
          (value as number) > 10_000
        )
          throw new Error();
      return Object.freeze({
        ...defaults,
        ...(parsed as Record<string, number>),
      });
    } catch {
      throw new Error(
        'Uber 配置 UBER_EATS_API_OPERATION_WEIGHTS 必须是值为正整数的 JSON 对象',
      );
    }
  }
  private validateUrl(key: string, value: string, originOnly: boolean): void {
    if (!value) return;
    try {
      const url = new URL(value);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        (originOnly && url.origin !== value.replace(/\/$/, ''))
      )
        throw new Error();
    } catch {
      throw new Error(`Uber 配置 ${key} 必须是有效的 HTTP(S) URL`);
    }
  }
}
