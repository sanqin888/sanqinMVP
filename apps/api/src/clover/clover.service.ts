import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

interface CloverRequestOptions {
  readonly searchParams?: Record<string, string | number | undefined>;
  readonly method?: string;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
}

@Injectable()
export class CloverService {
  private readonly logger = new Logger(CloverService.name);
  private readonly baseUrl: string;
  private readonly merchantId: string;
  private readonly accessToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly isConfigured: boolean;
  private hasLoggedMissingConfig = false;

  constructor() {
    this.baseUrl = (
      process.env.CLOVER_API_BASE_URL ?? 'https://sandbox.dev.clover.com/v3'
    ).replace(/\/$/, '');
    this.merchantId = process.env.CLOVER_MERCHANT_ID ?? '';
    this.accessToken = process.env.CLOVER_ACCESS_TOKEN ?? '';
    this.isConfigured = Boolean(this.merchantId && this.accessToken);

    const fetchFn = globalThis.fetch as typeof fetch | undefined;
    if (typeof fetchFn !== 'function') {
      throw new Error('Global fetch API is not available in this runtime');
    }

    this.fetchImpl = fetchFn.bind(globalThis) as typeof fetch;
  }

  private buildUrl(
    path: string,
    searchParams?: CloverRequestOptions['searchParams'],
  ): string {
    const normalizedPath = path.replace(/^\//, '');
    const url = new URL(`${this.baseUrl}/${normalizedPath}`);

    if (searchParams) {
      for (const [key, value] of Object.entries(searchParams)) {
        if (typeof value === 'undefined' || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  }

  private async request<T>(
    path: string,
    { searchParams, method = 'GET', body, headers = {} }: CloverRequestOptions = {},
  ): Promise<T> {
    if (!this.isConfigured) {
      if (!this.hasLoggedMissingConfig) {
        this.logger.warn(
          'Clover integration disabled: CLOVER_MERCHANT_ID and CLOVER_ACCESS_TOKEN must be provided.',
        );
        this.hasLoggedMissingConfig = true;
      }
      throw new ServiceUnavailableException(
        'Clover integration is not configured',
      );
    }

    const url = this.buildUrl(path, searchParams);

    const init: RequestInit = {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
    };

    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const response = await this.fetchImpl(url, init);

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(
        `Clover request failed: ${response.status} ${response.statusText} -> ${body}`,
      );
      throw new BadGatewayException(
        `Clover API request failed: ${response.status} ${response.statusText}`.trim(),
      );
    }

    return (await response.json()) as T;
  }

  async getMerchantProfile(): Promise<unknown> {
    return this.request(`merchants/${this.merchantId}`);
  }

  async listOrders(limit?: number): Promise<unknown> {
    return this.request(`merchants/${this.merchantId}/orders`, {
      searchParams: {
        limit:
          typeof limit === 'number'
            ? Math.max(1, Math.min(100, limit))
            : undefined,
      },
    });
  }

  async simulateOnlinePayment(payload: Record<string, unknown>): Promise<unknown> {
    return this.request(`merchants/${this.merchantId}/pay/online/simulate`, {
      method: 'POST',
      body: payload,
    });
  }
}
