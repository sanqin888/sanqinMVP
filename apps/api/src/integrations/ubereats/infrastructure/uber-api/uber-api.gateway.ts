import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppLogger } from '../../../../common/app-logger';
import { UberAuthService } from './uber-token.provider';
import {
  UberHttpClient,
  type UberHttpRequest,
  type UberHttpResult,
} from './uber-http.client';
import {
  UBER_RATE_LIMITER_PORT,
  type UberRateLimiterPort,
  type UberRateLimitLease,
} from './uber-rate-limiter';
import type {
  UberApiConfig,
  UberRateLimitConfig,
} from '../config/uber-config.service';

type UberGatewayRequestBase = Pick<
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

export type UberGatewayRequest =
  | (UberGatewayRequestBase & {
      method?: 'GET' | 'HEAD';
      idempotencyKey?: never;
    })
  | (UberGatewayRequestBase & {
      method: 'POST' | 'PUT';
      idempotencyKey: string;
    });

/** Contract mocked by application tests; global fetch belongs below this boundary. */
export interface UberResourceGateway {
  request<T = Record<string, unknown>>(request: UberGatewayRequest): Promise<T>;
}

@Injectable()
export class UberApiGatewayTransport {
  private readonly logger = new AppLogger(UberApiGatewayTransport.name);

  constructor(
    private readonly http: UberHttpClient,
    private readonly auth: UberAuthService,
    private readonly config: UberApiConfig & Partial<UberRateLimitConfig>,
    @Optional()
    @Inject(UBER_RATE_LIMITER_PORT)
    private readonly limiter?: UberRateLimiterPort,
  ) {}

  async request<T>(request: UberGatewayRequest): Promise<T> {
    return (await this.execute<T>(request, true)).data;
  }

  async inspect<T>(request: UberGatewayRequest): Promise<UberHttpResult<T>> {
    return this.execute<T>(request, false);
  }

  private async execute<T>(
    request: UberGatewayRequest,
    translateError: boolean,
  ): Promise<UberHttpResult<T>> {
    this.assertIdempotencyKey(request);
    const path = this.normalizePath(request.path);
    const baseUrl = this.normalizeBaseUrl(this.config.apiBaseUrl);
    const requestId = randomUUID();
    const partition = request.partitionKey?.trim() || 'merchant:app';
    const lease = await this.acquire(partition, request.operation);
    const startedAt = Date.now();
    let status = 0;
    try {
      let token =
        request.accessToken ?? (await this.auth.getAccessToken(request.scope));
      let result = await this.send<T>(request, baseUrl, path, token, requestId);
      if (
        (result.response.status === 401 || result.response.status === 403) &&
        !request.accessToken &&
        typeof this.auth.forceRefreshAccessToken === 'function'
      ) {
        token = await this.auth.forceRefreshAccessToken(request.scope);
        result = await this.send<T>(request, baseUrl, path, token, requestId);
      }
      status = result.response.status;
      lease.feedback({
        status,
        retryAfter: result.response.headers.get('retry-after'),
      });
      if (translateError) this.http.ensureSuccess(result, request.operation);
      return result;
    } finally {
      this.logger.log(
        `[uber gateway metric] operation=${request.operation} partition=${partition} requestId=${requestId} status=${status || 'error'} latencyMs=${Date.now() - startedAt}`,
      );
      lease.release();
    }
  }

  private send<T>(
    request: UberGatewayRequest,
    baseUrl: string,
    path: string,
    token: string,
    requestId: string,
  ) {
    return this.http.request<T>({
      ...request,
      path,
      baseUrl,
      accessToken: token,
      returnErrorResponse: true,
      headers: { 'X-Request-ID': requestId, ...request.headers },
    });
  }

  private assertIdempotencyKey(request: UberGatewayRequest): void {
    if (
      request.method === undefined ||
      request.method === 'GET' ||
      request.method === 'HEAD'
    )
      return;
    if (
      typeof request.idempotencyKey !== 'string' ||
      !request.idempotencyKey.trim()
    )
      throw new Error(
        `Uber 写请求缺少幂等键（operation=${request.operation}）；这是配置或编程错误`,
      );
  }

  private acquire(
    partitionKey: string,
    operation: string,
  ): Promise<UberRateLimitLease> {
    if (!this.limiter)
      return Promise.resolve({
        release: () => undefined,
        feedback: () => undefined,
      });
    return this.limiter.acquire({
      partitionKey,
      operation,
      weight: this.config.operationWeight?.(operation) ?? 1,
    });
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
