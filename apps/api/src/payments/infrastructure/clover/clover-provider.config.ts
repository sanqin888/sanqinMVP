import { Injectable } from '@nestjs/common';

@Injectable()
export class CloverProviderConfig {
  readonly ecommerceApiBase: string;
  readonly accessToken: string | undefined;
  readonly merchantId: string | undefined;
  readonly terminalDeviceId: string | undefined;

  constructor() {
    this.ecommerceApiBase =
      process.env.CLOVER_BASE?.trim() || 'https://api.clover.com';
    this.accessToken = process.env.CLOVER_ACCESS_TOKEN?.trim();
    this.merchantId = process.env.CLOVER_MERCHANT_ID?.trim();
    this.terminalDeviceId = process.env.CLOVER_DEVICE_ID?.trim();
  }
}
