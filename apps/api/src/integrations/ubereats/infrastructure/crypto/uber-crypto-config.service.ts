import { Injectable } from '@nestjs/common';

export interface UberWebhookSigningSecrets {
  readonly active: string;
  readonly previous?: Readonly<{ secret: string; validUntilEpochMs: number }>;
}

/** Secret material is isolated from transport and worker configuration. */
@Injectable()
export class UberCryptoConfigService {
  private readonly oauthStateSecret: string;
  private readonly active: string;
  private readonly previous: string;
  private readonly previousValidUntil: string;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.oauthStateSecret = this.read(env, 'UBER_EATS_OAUTH_STATE_SECRET');
    this.active =
      this.read(env, 'UBER_EATS_WEBHOOK_SIGNING_KEY_ACTIVE') ||
      this.read(env, 'UBER_EATS_WEBHOOK_SIGNING_KEY');
    this.previous = this.read(env, 'UBER_EATS_WEBHOOK_SIGNING_KEY_PREVIOUS');
    this.previousValidUntil = this.read(
      env,
      'UBER_EATS_WEBHOOK_SIGNING_KEY_PREVIOUS_VALID_UNTIL',
    );
  }

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

  getWebhookSigningSecrets(): UberWebhookSigningSecrets {
    if (!this.active)
      throw new Error('Uber 配置 UBER_EATS_WEBHOOK_SIGNING_KEY_ACTIVE 未配置');
    if (Boolean(this.previous) !== Boolean(this.previousValidUntil))
      throw new Error(
        'Uber 配置 previous signing secret 与有效截止时间必须同时配置',
      );
    if (!this.previous) return Object.freeze({ active: this.active });
    const validUntilEpochMs = Date.parse(this.previousValidUntil);
    if (!Number.isFinite(validUntilEpochMs))
      throw new Error(
        'Uber 配置 UBER_EATS_WEBHOOK_SIGNING_KEY_PREVIOUS_VALID_UNTIL 必须是有效 ISO-8601 时间',
      );
    return Object.freeze({
      active: this.active,
      previous: Object.freeze({ secret: this.previous, validUntilEpochMs }),
    });
  }

  private read(env: Record<string, string | undefined>, key: string): string {
    return env[key]?.trim() || '';
  }
}
