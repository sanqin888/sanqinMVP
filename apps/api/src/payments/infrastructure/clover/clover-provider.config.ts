import { Injectable } from '@nestjs/common';

@Injectable()
export class CloverProviderConfig {
  readonly ecommerceApiBase: string;
  readonly accessToken: string | undefined;
  readonly merchantId: string | undefined;
  readonly platformApiBase: string;
  readonly platformAccessToken: string | undefined;
  readonly terminalApiBase: string;
  readonly terminalAccessToken: string | undefined;
  readonly terminalDeviceId: string | undefined;
  readonly terminalPosId: string | undefined;
  readonly terminalTimeoutSeconds: number;
  readonly webhookAuthCode: string | undefined;

  constructor() {
    this.ecommerceApiBase =
      process.env.CLOVER_BASE?.trim() || 'https://api.clover.com';
    this.accessToken = process.env.CLOVER_ACCESS_TOKEN?.trim();
    this.merchantId = process.env.CLOVER_MERCHANT_ID?.trim();
    this.platformApiBase = (
      process.env.CLOVER_PLATFORM_API_BASE?.trim() || 'https://api.clover.com'
    ).replace(/\/$/, '');
    this.platformAccessToken = process.env.CLOVER_V3_ACCESS_TOKEN?.trim();
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
  }

  private parseTerminalTimeout(raw: string | undefined): number {
    const parsed = Number.parseInt(raw?.trim() || '', 10);
    if (!Number.isFinite(parsed) || parsed < 10 || parsed > 300) return 120;
    return parsed;
  }
}
