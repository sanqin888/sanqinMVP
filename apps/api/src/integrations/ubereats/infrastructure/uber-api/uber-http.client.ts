import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../common/app-logger';
import {
  UberApplicationError,
  type UberErrorCategory,
} from '../../application/shared/uber-application.error';

export type UberRequestKind = 'token' | 'api' | 'orderDetail' | 'imageProbe';

export type UberApiErrorCategory = UberErrorCategory;

/** A safe, stable error contract shared by every Uber HTTP integration. */
export class UberApiError extends UberApplicationError {
  constructor(
    readonly httpStatus: number | null,
    readonly uberCode: string,
    readonly safeDetail: string,
    readonly operation: string,
    readonly retryable: boolean,
    readonly category: UberApiErrorCategory,
    readonly retryAfterMs: number | null = null,
    cause?: unknown,
  ) {
    super(category, uberCode, safeDetail, operation, retryable, {
      retryAfterMs,
      upstreamStatus: httpStatus,
      cause,
    });
    this.name = 'UberApiError';
  }
}

export class UberHttpError extends UberApiError {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly reason: 'timeout' | 'network' | 'response_too_large',
    cause?: unknown,
  ) {
    super(
      null,
      reason === 'timeout'
        ? 'UBER_TIMEOUT'
        : reason === 'network'
          ? 'UBER_NETWORK_ERROR'
          : 'UBER_RESPONSE_TOO_LARGE',
      message,
      'uber.http',
      retryable,
      retryable ? 'transient-upstream' : 'non-retryable-upstream',
      null,
      cause,
    );
    this.name = 'UberHttpError';
  }
}

export type UberHttpResult<T = unknown> = {
  response: Response;
  text: string;
  data: T;
};

export type UberHttpRequest = {
  url?: string;
  path?: string;
  baseUrl?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'HEAD';
  accessToken?: string;
  headers?: Record<string, string>;
  json?: unknown;
  body?: BodyInit;
  kind?: UberRequestKind;
  redirect?: RequestRedirect;
  idempotencyKey?: string;
  maxResponseBytes?: number;
  operation?: string;
  /** Compatibility escape hatch for callers which explicitly inspect statuses. */
  returnErrorResponse?: boolean;
};

const DEFAULT_TIMEOUTS: Record<UberRequestKind, number> = {
  token: 10_000,
  api: 10_000,
  orderDetail: 15_000,
  imageProbe: 8_000,
};
const TIMEOUT_ENV: Record<UberRequestKind, string> = {
  token: 'UBER_EATS_TOKEN_TIMEOUT_MS',
  api: 'UBER_EATS_API_TIMEOUT_MS',
  orderDetail: 'UBER_EATS_ORDER_DETAIL_TIMEOUT_MS',
  imageProbe: 'UBER_EATS_IMAGE_PROBE_TIMEOUT_MS',
};

@Injectable()
export class UberHttpClient {
  private readonly logger = new AppLogger(UberHttpClient.name);
  private readonly apiBaseUrl =
    process.env.UBER_EATS_API_BASE_URL?.trim() || '';
  private readonly maxAttempts = this.safeNumber(
    'UBER_EATS_HTTP_MAX_ATTEMPTS',
    3,
    1,
    5,
  );
  private readonly maxRetryDelayMs = this.safeNumber(
    'UBER_EATS_HTTP_MAX_RETRY_DELAY_MS',
    2_000,
    50,
    30_000,
  );
  private readonly maxResponseBytes = this.safeNumber(
    'UBER_EATS_HTTP_MAX_RESPONSE_BYTES',
    2_000_000,
    1_024,
    10_000_000,
  );

  async request<T = unknown>(
    options: UberHttpRequest,
  ): Promise<UberHttpResult<T>> {
    const method = options.method ?? 'GET';
    const url =
      options.url ??
      `${(options.baseUrl ?? this.apiBaseUrl).replace(/\/$/, '')}${options.path ?? ''}`;
    const retryableRequest =
      method === 'GET' || method === 'HEAD' || Boolean(options.idempotencyKey);
    const attempts = retryableRequest ? this.maxAttempts : 1;

    for (let attempt = 1; ; attempt += 1) {
      try {
        const result = await this.requestOnce<T>(url, method, options);
        if (
          attempt < attempts &&
          (result.response.status === 429 || result.response.status >= 500)
        ) {
          await this.backoff(
            attempt,
            this.parseRetryAfter(result.response.headers.get('retry-after')),
          );
          continue;
        }
        if (!result.response.ok && !options.returnErrorResponse) {
          throw this.fromResponse(
            result.response,
            result.data,
            options.operation ?? `${method} ${this.safePath(url)}`,
          );
        }
        return result;
      } catch (error) {
        const domainError = this.toDomainError(
          error,
          options.operation ?? `${method} ${this.safePath(url)}`,
        );
        this.logger.error(
          `[uber http] operation=${domainError.operation} url=${this.redact(url)} failed code=${domainError.uberCode} retryable=${domainError.retryable}`,
        );
        if (!domainError.retryable || attempt >= attempts) throw domainError;
        await this.backoff(attempt);
      }
    }
  }

  /** Convert an inspected non-success response to the shared safe error contract. */
  ensureSuccess(result: UberHttpResult, operation: string): UberHttpResult {
    if (!result.response.ok)
      throw this.fromResponse(result.response, result.data, operation);
    return result;
  }

  private async requestOnce<T>(
    url: string,
    method: string,
    options: UberHttpRequest,
  ): Promise<UberHttpResult<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.timeoutFor(options.kind ?? 'api'),
    );
    try {
      const response = await fetch(url, {
        method,
        signal: controller.signal,
        redirect: options.redirect,
        headers: {
          Accept: 'application/json',
          ...(options.accessToken
            ? { Authorization: `Bearer ${options.accessToken}` }
            : {}),
          ...(options.json !== undefined
            ? { 'Content-Type': 'application/json' }
            : {}),
          ...(options.idempotencyKey
            ? { 'Idempotency-Key': options.idempotencyKey }
            : {}),
          ...options.headers,
        },
        body:
          options.json !== undefined
            ? JSON.stringify(options.json)
            : options.body,
      });
      const text =
        method === 'HEAD'
          ? ''
          : await this.readLimited(
              response,
              options.maxResponseBytes ?? this.maxResponseBytes,
            );
      let data: unknown = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      return { response, text, data: data as T };
    } catch (error) {
      throw this.toDomainError(
        error,
        options.operation ?? `${method} ${this.safePath(url)}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readLimited(
    response: Response,
    limit: number,
  ): Promise<string> {
    const declared = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(declared) && declared > limit)
      throw new UberHttpError(
        'Uber 响应正文超过大小限制',
        false,
        'response_too_large',
      );
    if (!response.body) {
      const text =
        typeof response.text === 'function' ? await response.text() : '';
      if (new TextEncoder().encode(text).byteLength > limit)
        throw new UberHttpError(
          'Uber 响应正文超过大小限制',
          false,
          'response_too_large',
        );
      return text;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let text = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new UberHttpError(
          'Uber 响应正文超过大小限制',
          false,
          'response_too_large',
        );
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  }

  private timeoutFor(kind: UberRequestKind): number {
    return this.safeNumber(
      TIMEOUT_ENV[kind],
      DEFAULT_TIMEOUTS[kind],
      100,
      120_000,
    );
  }

  private safeNumber(
    name: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value >= min && value <= max
      ? Math.floor(value)
      : fallback;
  }

  private toDomainError(error: unknown, operation: string): UberApiError {
    if (error instanceof UberApiError) {
      if (error.operation === 'uber.http')
        Object.defineProperty(error, 'operation', { value: operation });
      return error;
    }
    const timeout = error instanceof Error && error.name === 'AbortError';
    const domainError = new UberHttpError(
      timeout ? 'Uber 请求超时' : 'Uber 网络请求失败',
      true,
      timeout ? 'timeout' : 'network',
      error,
    );
    Object.defineProperty(domainError, 'operation', { value: operation });
    return domainError;
  }

  private fromResponse(
    response: Response,
    data: unknown,
    operation: string,
  ): UberApiError {
    const body =
      data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    const rawCode = [body.code, body.error_code, body.error].find(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
    const rawDetail = [body.message, body.error_description, body.detail].find(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
    const status = response.status;
    const scopeFailure =
      status === 403 ||
      /scope|permission|insufficient/i.test(
        `${rawCode ?? ''} ${rawDetail ?? ''}`,
      );
    const category: UberApiErrorCategory =
      status === 401
        ? 'authentication'
        : scopeFailure
          ? 'authentication'
          : status === 429
            ? 'rate-limited'
            : status === 408 || status >= 500
              ? 'transient-upstream'
              : status === 409 || status === 422
                ? 'business-conflict'
                : status >= 400 && status < 500
                  ? 'validation'
                  : 'non-retryable-upstream';
    const stableCode =
      status === 401
        ? 'UBER_ACCESS_TOKEN_INVALID'
        : scopeFailure
          ? 'UBER_SCOPE_INSUFFICIENT'
          : rawCode
            ? `UBER_${rawCode.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}`
            : `UBER_HTTP_${status}`;
    const retryable = status === 408 || status === 429 || status >= 500;
    return new UberApiError(
      status,
      stableCode,
      this.sanitize(rawDetail ?? `Uber 返回 HTTP ${status}`),
      operation,
      retryable,
      category,
      this.parseRetryAfter(response.headers.get('retry-after')),
    );
  }

  private parseRetryAfter(value: string | null): number | null {
    if (!value) return null;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0)
      return Math.round(seconds * 1_000);
    const date = Date.parse(value);
    return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
  }

  private sanitize(value: string): string {
    return value
      .replace(
        /\b(?:access[_-]?token|refresh[_-]?token|token)\s*[:=]\s*[^\s,;"}]+/gi,
        'token=[REDACTED]',
      )
      .replace(
        /\b(?:authorization|client[_-]?secret|secret)\s*[:=]\s*[^\s,;"}]+/gi,
        'credential=[REDACTED]',
      )
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [REDACTED]')
      .replace(/\s+/g, ' ')
      .slice(0, 500);
  }

  private safePath(value: string): string {
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname}`;
    } catch {
      return value.split('?')[0];
    }
  }

  private async backoff(
    attempt: number,
    retryAfterMs: number | null = null,
  ): Promise<void> {
    const ceiling = Math.min(this.maxRetryDelayMs, 100 * 2 ** (attempt - 1));
    if (retryAfterMs !== null) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(retryAfterMs, this.maxRetryDelayMs)),
      );
      return;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.floor(Math.random() * ceiling)),
    );
  }

  private redact(value: string): string {
    try {
      const url = new URL(value);
      for (const key of ['access_token', 'token', 'code', 'client_secret'])
        if (url.searchParams.has(key)) url.searchParams.set(key, '[REDACTED]');
      return url.toString();
    } catch {
      return value.replace(
        /(token|secret|code|authorization)=?[^\s&]*/gi,
        '$1=[REDACTED]',
      );
    }
  }
}
