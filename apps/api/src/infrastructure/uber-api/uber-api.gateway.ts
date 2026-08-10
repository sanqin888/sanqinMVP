import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppLogger } from '../../common/app-logger';
import { UberAuthService } from '../../integrations/ubereats/uber-auth.service';
import {
  UberHttpClient,
  type UberHttpRequest,
  type UberHttpResult,
} from '../../integrations/ubereats/uber-http.client';

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
};

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
    private readonly config: { apiBaseUrl: string },
  ) {}

  async request<T>(request: UberGatewayRequest): Promise<T> {
    const path = this.normalizePath(request.path);
    const requestId = randomUUID();
    let token = await this.auth.getAccessToken(request.scope);
    let result = await this.send<T>(request, path, token, requestId);
    if (
      (result.response.status === 401 || result.response.status === 403) &&
      typeof this.auth.forceRefreshAccessToken === 'function'
    ) {
      token = await this.auth.forceRefreshAccessToken(request.scope);
      result = await this.send<T>(request, path, token, requestId);
    }
    this.http.ensureSuccess(result, request.operation);
    this.logger.log(
      `[uber gateway] operation=${request.operation} requestId=${requestId} status=${result.response.status}`,
    );
    return result.data;
  }

  async inspect<T>(request: UberGatewayRequest): Promise<UberHttpResult<T>> {
    const path = this.normalizePath(request.path);
    const requestId = randomUUID();
    let token = await this.auth.getAccessToken(request.scope);
    let result = await this.send<T>(request, path, token, requestId);
    if (
      (result.response.status === 401 || result.response.status === 403) &&
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
