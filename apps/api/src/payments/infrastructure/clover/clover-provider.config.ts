import { Injectable } from '@nestjs/common';
import { isIP } from 'node:net';

@Injectable()
export class CloverProviderConfig {
  readonly ecommerceApiBase: string;
  readonly ecommerceAccessToken: string | undefined;
  readonly ecommerceMerchantId: string | undefined;
  readonly webhookAuthCode: string | undefined;

  readonly unifiedMerchantId: string | undefined;
  readonly unifiedStoreStableId: string | undefined;
  readonly unifiedPlatformApiBase: string | undefined;
  readonly unifiedOauthClientId: string | undefined;
  readonly unifiedOauthClientSecret: string | undefined;
  readonly unifiedOauthAuthorizeBase: string | undefined;
  readonly unifiedOauthApiBase: string | undefined;
  readonly unifiedOauthCallbackUrl: string | undefined;
  readonly unifiedOauthScopesMetadata: string | undefined;

  readonly terminalApiBase: string | undefined;
  readonly terminalDeviceId: string | undefined;
  readonly terminalRemoteAppId: string | undefined;
  readonly terminalTimeoutSeconds: number | undefined;
  readonly terminalSandboxManualEntryEnabled: boolean;

  readonly oauthStateTtlMs = 10 * 60 * 1000;
  readonly oauthRefreshSkewMs = 2 * 60 * 1000;

  constructor() {
    this.ecommerceApiBase =
      process.env.CLOVER_BASE?.trim() || 'https://api.clover.com';
    this.ecommerceAccessToken = process.env.CLOVER_ACCESS_TOKEN?.trim();
    this.ecommerceMerchantId = process.env.CLOVER_MERCHANT_ID?.trim();
    this.webhookAuthCode = process.env.CLOVER_WEBHOOK_AUTH_CODE?.trim();

    this.unifiedMerchantId = process.env.CLOVER_UNIFIED_MERCHANT_ID?.trim();
    this.unifiedStoreStableId =
      process.env.CLOVER_UNIFIED_STORE_STABLE_ID?.trim();
    this.unifiedPlatformApiBase = this.optionalBaseUrl(
      process.env.CLOVER_UNIFIED_PLATFORM_API_BASE,
    );
    this.unifiedOauthClientId =
      process.env.CLOVER_UNIFIED_OAUTH_CLIENT_ID?.trim();
    this.unifiedOauthClientSecret =
      process.env.CLOVER_UNIFIED_OAUTH_CLIENT_SECRET?.trim();
    this.unifiedOauthAuthorizeBase = this.optionalBaseUrl(
      process.env.CLOVER_UNIFIED_OAUTH_AUTHORIZE_BASE,
    );
    this.unifiedOauthApiBase = this.optionalBaseUrl(
      process.env.CLOVER_UNIFIED_OAUTH_API_BASE,
    );
    this.unifiedOauthCallbackUrl =
      process.env.CLOVER_UNIFIED_OAUTH_CALLBACK_URL?.trim();
    this.unifiedOauthScopesMetadata =
      process.env.CLOVER_UNIFIED_OAUTH_SCOPES?.trim();

    this.terminalApiBase = this.optionalBaseUrl(
      process.env.CLOVER_TERMINAL_API_BASE,
    );
    this.terminalDeviceId = process.env.CLOVER_TERMINAL_DEVICE_ID?.trim();
    this.terminalRemoteAppId =
      process.env.CLOVER_TERMINAL_REMOTE_APP_ID?.trim();
    this.terminalTimeoutSeconds = this.parseTerminalTimeout(
      process.env.CLOVER_TERMINAL_TIMEOUT_SECONDS,
    );
    this.terminalSandboxManualEntryEnabled =
      this.isIsolatedSandboxManualEntryEnabled(process.env);
  }

  /** Opt-in device test only: never enable manual entry on production payment traffic. */
  private isIsolatedSandboxManualEntryEnabled(env: NodeJS.ProcessEnv): boolean {
    if (
      (env.NODE_ENV !== 'development' && env.NODE_ENV !== 'test') ||
      env.CLOVER_TERMINAL_SANDBOX_MANUAL_ENTRY_ENABLED !== 'true'
    ) {
      return false;
    }
    try {
      const db = new URL(env.DATABASE_URL ?? '');
      const platform = new URL(env.CLOVER_UNIFIED_PLATFORM_API_BASE ?? '');
      const terminal = new URL(env.CLOVER_TERMINAL_API_BASE ?? '');
      const unifiedMerchant = env.CLOVER_UNIFIED_MERCHANT_ID?.trim();
      const webMerchant = env.CLOVER_MERCHANT_ID?.trim();
      return (
        (db.protocol === 'postgres:' || db.protocol === 'postgresql:') &&
        ['localhost', '127.0.0.1', '[::1]'].includes(db.hostname) &&
        platform.protocol === 'https:' &&
        platform.hostname === 'apisandbox.dev.clover.com' &&
        terminal.protocol === 'https:' &&
        (terminal.hostname === 'apisandbox.dev.clover.com' ||
          this.isPrivateCompactLanUrl(terminal)) &&
        Boolean(unifiedMerchant) &&
        unifiedMerchant !== webMerchant &&
        Boolean(env.CLOVER_TERMINAL_DEVICE_ID?.trim())
      );
    } catch {
      return false;
    }
  }

  /** A physical Compact's local REST Pay Display listener, not an arbitrary URL. */
  private isPrivateCompactLanUrl(url: URL): boolean {
    if (
      url.port !== '12346' ||
      url.pathname !== '/' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      isIP(url.hostname) !== 4
    ) {
      return false;
    }
    const octets = url.hostname.split('.').map(Number);
    const [first, second] = octets;
    return (
      first === 10 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }

  private optionalBaseUrl(raw: string | undefined): string | undefined {
    const value = raw?.trim();
    return value ? value.replace(/\/$/, '') : undefined;
  }

  private parseTerminalTimeout(raw: string | undefined): number | undefined {
    const value = raw?.trim();
    if (!value) return undefined;
    if (!/^\d+$/.test(value)) return undefined;
    const parsed = Number.parseInt(value, 10);
    if (parsed < 10 || parsed > 300) return undefined;
    return parsed;
  }
}
