import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { AppLogger } from '../../../../common/app-logger';
import { UberAuthService } from './uber-token.provider';
import {
  UberHttpClient,
  type UberHttpRequest,
  type UberHttpResult,
} from './uber-http.client';

export type UberGatewayRequest = Pick<
  UberHttpRequest,
  | 'method'
  | 'json'
  | 'body'
  | 'headers'
  | 'idempotencyKey'
  | 'kind'
  | 'maxResponseBytes'
> & {
  path: string;
  operation: string;
  scope: string;
  /** Merchant/store identifier used to isolate noisy tenants. */
  partitionKey?: string;
  /** Explicit merchant token; app-scoped calls obtain one from UberAuthService. */
  accessToken?: string;
};

/** Contract mocked by application tests; global fetch belongs below this boundary. */
export interface UberResourceGateway {
  request<T = Record<string, unknown>>(request: UberGatewayRequest): Promise<T>;
}

@Injectable()
export class UberApiGatewayTransport {
  private readonly logger = new AppLogger(UberApiGatewayTransport.name);
  private readonly active = new Map<string, number>();
  private readonly waiters = new Map<string, Array<() => void>>();
  private readonly concurrencyLimit = this.readConcurrencyLimit();

  constructor(
    private readonly http: UberHttpClient,
    private readonly auth: UberAuthService,
    private readonly config: { apiBaseUrl: string },
  ) {}

  async request<T>(request: UberGatewayRequest): Promise<T> {
    const release = await this.acquire(request);
    const startedAt = Date.now();
    try {
      const path = this.normalizePath(request.path);
      const requestId = randomUUID();
      request = this.withIdempotencyKey(request, requestId);
      let token =
        request.accessToken ?? (await this.auth.getAccessToken(request.scope));
      let result = await this.send<T>(request, path, token, requestId);
      if (
        (result.response.status === 401 || result.response.status === 403) &&
        !request.accessToken &&
        typeof this.auth.forceRefreshAccessToken === 'function'
      ) {
        token = await this.auth.forceRefreshAccessToken(request.scope);
        result = await this.send<T>(request, path, token, requestId);
      }
      this.http.ensureSuccess(result, request.operation);
      this.logger.log(
        `[uber gateway metric] operation=${request.operation} partition=${this.partition(request)} requestId=${requestId} status=${result.response.status} latencyMs=${Date.now() - startedAt}`,
      );
      return result.data;
    } finally {
      release();
    }
  }

  async inspect<T>(request: UberGatewayRequest): Promise<UberHttpResult<T>> {
    const path = this.normalizePath(request.path);
    const requestId = randomUUID();
    let token =
      request.accessToken ?? (await this.auth.getAccessToken(request.scope));
    let result = await this.send<T>(request, path, token, requestId);
    if (
      (result.response.status === 401 || result.response.status === 403) &&
      !request.accessToken &&
      typeof this.auth.forceRefreshAccessToken === 'function'
    ) {
      token = await this.auth.forceRefreshAccessToken(request.scope);
      result = await this.send<T>(request, path, token, requestId);
    }
    return result;
  }

  private send<T>(
    request: UberGatewayRequest,
    path: string,
    token: string,
    requestId: string,
  ) {
    return this.http.request<T>({
      ...request,
      path,
      baseUrl: this.normalizeBaseUrl(this.config.apiBaseUrl),
      accessToken: token,
      returnErrorResponse: true,
      headers: { 'X-Request-ID': requestId, ...request.headers },
    });
  }

  /** Every non-read call gets one key here and keeps it across auth refresh/retries. */
  private withIdempotencyKey(
    request: UberGatewayRequest,
    requestId: string,
  ): UberGatewayRequest {
    if (
      request.method === undefined ||
      ['GET', 'HEAD'].includes(request.method)
    )
      return request;
    if (request.idempotencyKey) return request;
    const digest = createHash('sha256')
      .update(
        `${request.operation}:${request.partitionKey ?? 'global'}:${requestId}`,
      )
      .digest('hex');
    return { ...request, idempotencyKey: `uber-${digest}` };
  }

  private partition(request: UberGatewayRequest): string {
    return `${request.operation}:${request.partitionKey ?? 'global'}`;
  }

  private async acquire(request: UberGatewayRequest): Promise<() => void> {
    const key = this.partition(request);
    if ((this.active.get(key) ?? 0) >= this.concurrencyLimit) {
      await new Promise<void>((resolve) => {
        const queue = this.waiters.get(key) ?? [];
        queue.push(resolve);
        this.waiters.set(key, queue);
      });
    }
    this.active.set(key, (this.active.get(key) ?? 0) + 1);
    return () => {
      this.active.set(key, Math.max(0, (this.active.get(key) ?? 1) - 1));
      this.waiters.get(key)?.shift()?.();
    };
  }

  private readConcurrencyLimit(): number {
    const configured = Number(
      process.env.UBER_EATS_API_CONCURRENCY_PER_PARTITION,
    );
    return Number.isInteger(configured) && configured > 0
      ? Math.min(configured, 50)
      : 4;
  }

  private normalizeBaseUrl(value: string): string {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new Error('Uber API base URL 必须是无凭据的 HTTPS URL');
    url.pathname = url.pathname.replace(/\/+$/, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  }

  private normalizePath(value: string): string {
    if (!value.startsWith('/') || value.startsWith('//'))
      throw new Error('Uber gateway 只接受绝对 path');
    const url = new URL(value, 'https://gateway.invalid');
    if (
      url.origin !== 'https://gateway.invalid' ||
      url.username ||
      url.password
    )
      throw new Error('Uber gateway path 无效');
    return `${url.pathname}${url.search}`;
  }
}
