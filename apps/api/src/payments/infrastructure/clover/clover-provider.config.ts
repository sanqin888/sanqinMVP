import { Injectable } from '@nestjs/common';

@Injectable()
export class CloverProviderConfig {
  readonly ecommerceApiBase: string;
  readonly accessToken: string | undefined;
  readonly merchantId: string | undefined;
  readonly storeStableId: string | undefined;
  readonly platformApiBase: string;
  readonly terminalApiBase: string;
  readonly terminalAccessToken: string | undefined;
  readonly terminalDeviceId: string | undefined;
  readonly terminalPosId: string | undefined;
  readonly terminalTimeoutSeconds: number;
  readonly webhookAuthCode: string | undefined;
  readonly oauthClientId: string | undefined;
  readonly oauthClientSecret: string | undefined;
  readonly oauthAuthorizeBase: string;
  readonly oauthApiBase: string;
  readonly oauthCallbackUrl: string | undefined;
  readonly oauthScopesMetadata: string | undefined;
  readonly oauthStateTtlMs = 10 * 60 * 1000;
  readonly oauthRefreshSkewMs = 2 * 60 * 1000;

  constructor() {
    this.ecommerceApiBase =
      process.env.CLOVER_BASE?.trim() || 'https://api.clover.com';
    this.accessToken = process.env.CLOVER_ACCESS_TOKEN?.trim();
    this.merchantId = process.env.CLOVER_MERCHANT_ID?.trim();
    this.storeStableId = process.env.CLOVER_STORE_STABLE_ID?.trim();
    this.platformApiBase = (
      process.env.CLOVER_PLATFORM_API_BASE?.trim() || 'https://api.clover.com'
    ).replace(/\/$/, '');
    this.terminalApiBase = (
      process.env.CLOVER_TERMINAL_BASE?.trim() || this.ecommerceApiBase
    ).replace(/\/$/, '');
    this.terminalAccessToken = process.env.CLOVER_TERMINAL_OAUTH_TOKEN?.trim();
    this.terminalDeviceId = process.env.CLOVER_DEVICE_ID?.trim();
    this.terminalPosId = process.env.CLOVER_REMOTE_APP_ID?.trim();
    this.terminalTimeoutSeconds = this.parseTerminalTimeout(
      process.env.CLOVER_TERMINAL_TIMEOUT_SECONDS,
    );
    this.webhookAuthCode = process.env.CLOVER_WEBHOOK_AUTH_CODE?.trim();
    this.oauthClientId = process.env.CLOVER_OAUTH_CLIENT_ID?.trim();
    this.oauthClientSecret = process.env.CLOVER_OAUTH_CLIENT_SECRET?.trim();
    this.oauthAuthorizeBase = (
      process.env.CLOVER_OAUTH_AUTHORIZE_BASE?.trim() ||
      'https://www.clover.com'
    ).replace(/\/$/, '');
    this.oauthApiBase = (
      process.env.CLOVER_OAUTH_API_BASE?.trim() || 'https://api.clover.com'
    ).replace(/\/$/, '');
    this.oauthCallbackUrl = process.env.CLOVER_OAUTH_CALLBACK_URL?.trim();
    this.oauthScopesMetadata = process.env.CLOVER_OAUTH_SCOPES?.trim();
  }

  private parseTerminalTimeout(raw: string | undefined): number {
    const parsed = Number.parseInt(raw?.trim() || '', 10);
    if (!Number.isFinite(parsed) || parsed < 10 || parsed > 300) return 120;
    return parsed;
  }
}
