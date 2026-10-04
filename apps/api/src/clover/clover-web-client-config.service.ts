import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export type CloverWebClientConfig = {
  publicToken: string;
  merchantId: string;
  sdkUrl: string;
};

@Injectable()
export class CloverWebClientConfigService {
  getConfig(): CloverWebClientConfig {
    const publicToken = process.env.CLOVER_WEB_PUBLIC_TOKEN?.trim();
    const merchantId = process.env.CLOVER_MERCHANT_ID?.trim();
    const sdkUrl = process.env.CLOVER_WEB_SDK_URL?.trim();

    if (
      !publicToken ||
      !merchantId ||
      !sdkUrl ||
      !this.isValidHttpsUrl(sdkUrl)
    ) {
      throw new ServiceUnavailableException({
        code: 'CLOVER_WEB_CLIENT_CONFIG_UNAVAILABLE',
        message: 'Clover Web client configuration is unavailable',
      });
    }

    return {
      publicToken,
      merchantId,
      sdkUrl,
    };
  }

  private isValidHttpsUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === 'https:';
    } catch {
      return false;
    }
  }
}
