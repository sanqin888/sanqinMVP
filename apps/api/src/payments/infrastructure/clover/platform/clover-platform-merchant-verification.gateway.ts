import { Injectable } from '@nestjs/common';

import { CloverProviderConfig } from '../clover-provider.config';

const PLATFORM_VERIFICATION_TIMEOUT_MS = 8_000;

export type CloverMerchantIdentity = {
  id: string;
  name: string | null;
};

export class CloverPlatformVerificationError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly httpStatus?: number,
  ) {
    super(code);
    this.name = 'CloverPlatformVerificationError';
  }
}

@Injectable()
export class CloverPlatformMerchantVerificationGateway {
  constructor(private readonly config: CloverProviderConfig) {}

  async getMerchantIdentity(
    merchantId: string,
    accessToken: string,
  ): Promise<CloverMerchantIdentity> {
    const response = await this.request(
      `/v3/merchants/${encodeURIComponent(merchantId)}`,
      accessToken,
    );
    if (!response.ok) {
      throw new CloverPlatformVerificationError(
        `CLOVER_MERCHANT_HTTP_${response.status}`,
        response.status >= 500 || response.status === 429,
        response.status,
      );
    }
    const body = await this.parseJson(response);
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) {
      throw new CloverPlatformVerificationError(
        'CLOVER_MERCHANT_RESPONSE_INVALID',
        false,
      );
    }
    return {
      id,
      name:
        typeof body.name === 'string' && body.name.trim()
          ? body.name.trim()
          : null,
    };
  }

  async verifyPaymentsRead(
    merchantId: string,
    accessToken: string,
  ): Promise<void> {
    const response = await this.request(
      `/v3/merchants/${encodeURIComponent(merchantId)}/payments?limit=1`,
      accessToken,
    );
    if (!response.ok) {
      throw new CloverPlatformVerificationError(
        `CLOVER_PAYMENTS_READ_HTTP_${response.status}`,
        response.status >= 500 || response.status === 429,
        response.status,
      );
    }
  }

  private async request(path: string, accessToken: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      PLATFORM_VERIFICATION_TIMEOUT_MS,
    );
    try {
      return await fetch(`${this.config.platformApiBase}${path}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'SanQ-Payments/1.0',
        },
        signal: controller.signal,
      });
    } catch (error) {
      throw new CloverPlatformVerificationError(
        error instanceof Error && error.name === 'AbortError'
          ? 'CLOVER_PLATFORM_VERIFICATION_TIMEOUT'
          : 'CLOVER_PLATFORM_VERIFICATION_NETWORK_ERROR',
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async parseJson(
    response: Response,
  ): Promise<Record<string, unknown>> {
    try {
      const value: unknown = await response.json();
      return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    } catch {
      throw new CloverPlatformVerificationError(
        'CLOVER_PLATFORM_VERIFICATION_RESPONSE_INVALID',
        false,
      );
    }
  }
}
