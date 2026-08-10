import { BadRequestException, Injectable } from '@nestjs/common';
import { isIP } from 'node:net';
import { randomUUID } from 'node:crypto';
import { AppLogger } from '../../common/app-logger';
import { UberAuthService } from '../../integrations/ubereats/uber-auth.service';
import { UberConfigService } from '../../integrations/ubereats/uber-config.service';
import {
  UberApiError,
  UberHttpClient,
  type UberHttpResult,
  type UberRequestKind,
} from '../../integrations/ubereats/uber-http.client';

export type UberGatewayRequest = {
  method?: 'GET' | 'POST' | 'PUT' | 'HEAD';
  accessToken?: string;
  scope?: string;
  body?: unknown;
  rawBody?: BodyInit;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  operation: string;
  kind?: UberRequestKind;
  maxResponseBytes?: number;
  returnErrorResponse?: boolean;
};

/** Contract consumed by application services and replaced by a single mock in tests. */
export interface UberResourceGateway {
  request<T = Record<string, unknown>>(
    path: string,
    options: UberGatewayRequest,
  ): Promise<UberHttpResult<T>>;
}

abstract class UberGatewayBase implements UberResourceGateway {
  private readonly logger = new AppLogger(this.constructor.name);

  protected constructor(
    private readonly http: UberHttpClient,
    private readonly auth: UberAuthService,
    private readonly config: UberConfigService,
  ) {}

  async request<T>(path: string, options: UberGatewayRequest) {
    const normalizedPath = this.normalizePath(path);
    const requestId = randomUUID();
    const send = async (accessToken?: string) =>
      this.http.request<T>({
        baseUrl: this.normalizedBaseUrl(),
        path: normalizedPath,
        method: options.method,
        accessToken,
        json: options.rawBody === undefined ? options.body : undefined,
        body: options.rawBody,
        headers: { 'X-Request-ID': requestId, ...options.headers },
        idempotencyKey: options.idempotencyKey,
        operation: options.operation,
        kind: options.kind ?? 'api',
        maxResponseBytes: options.maxResponseBytes,
        redirect: 'error',
        returnErrorResponse: options.returnErrorResponse,
      });

    let token = options.accessToken;
    if (!token && options.scope)
      token = await this.auth.getAccessToken(options.scope);
    try {
      let result = await send(token);
      if (
        (result.response.status === 401 || result.response.status === 403) &&
        options.scope &&
        typeof this.auth.forceRefreshAccessToken === 'function'
      ) {
        token = await this.auth.forceRefreshAccessToken(options.scope);
        result = await send(token);
      }
      return result;
    } catch (error) {
      if (
        error instanceof UberApiError &&
        (error.httpStatus === 401 || error.httpStatus === 403) &&
        options.scope &&
        typeof this.auth.forceRefreshAccessToken === 'function'
      ) {
        token = await this.auth.forceRefreshAccessToken(options.scope);
        return send(token);
      }
      this.logger.error(
        `[uber gateway] operation=${options.operation} requestId=${requestId} path=${normalizedPath} failed`,
      );
      throw error;
    }
  }

  protected normalizePath(path: string): string {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
      throw new BadRequestException('Uber API path 无效');
    }
    const parsed = new URL(path, 'https://gateway.invalid');
    if (parsed.origin !== 'https://gateway.invalid') {
      throw new BadRequestException('业务层不得传入外部 URL');
    }
    return `${parsed.pathname}${parsed.search}`;
  }

  private normalizedBaseUrl(): string {
    const url = new URL(this.config.apiBaseUrl);
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new BadRequestException('Uber API base URL 必须为安全 HTTPS URL');
    }
    url.pathname = url.pathname.replace(/\/+$/, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  }
}

@Injectable()
export class UberMerchantGateway extends UberGatewayBase {
  constructor(
    http: UberHttpClient,
    auth: UberAuthService,
    config: UberConfigService,
  ) {
    super(http, auth, config);
  }
}

@Injectable()
export class UberStoreGateway extends UberGatewayBase {
  constructor(
    http: UberHttpClient,
    auth: UberAuthService,
    config: UberConfigService,
  ) {
    super(http, auth, config);
  }
}

@Injectable()
export class UberMenuGateway extends UberGatewayBase {
  constructor(
    http: UberHttpClient,
    auth: UberAuthService,
    config: UberConfigService,
  ) {
    super(http, auth, config);
  }
}

@Injectable()
export class UberOrderGateway extends UberGatewayBase {
  constructor(
    http: UberHttpClient,
    auth: UberAuthService,
    private readonly uberConfig: UberConfigService,
  ) {
    super(http, auth, uberConfig);
  }

  /** Maps an allowlisted webhook href to the configured API origin; redirects remain disabled. */
  resourcePath(resourceHref: string): string {
    let resource: URL;
    try {
      resource = new URL(resourceHref);
    } catch {
      throw new BadRequestException('Uber resource_href 无效');
    }
    const allowed = new Set(
      this.uberConfig.resourceHrefAllowedOrigins
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => new URL(value).origin),
    );
    const port = resource.port || (resource.protocol === 'https:' ? '443' : '');
    const unsafeAddress =
      isIP(resource.hostname) !== 0 ||
      resource.hostname === 'localhost' ||
      resource.hostname.endsWith('.localhost');
    if (
      resource.protocol !== 'https:' ||
      port !== '443' ||
      resource.username ||
      resource.password ||
      unsafeAddress ||
      !allowed.has(resource.origin)
    ) {
      throw new BadRequestException('Uber resource_href 不属于允许的来源');
    }
    // Exact HTTPS-origin allowlisting prevents attacker-controlled DNS names;
    // the transport also forbids redirects, preventing post-validation pivots.
    return this.normalizePath(`${resource.pathname}${resource.search}`);
  }
}
