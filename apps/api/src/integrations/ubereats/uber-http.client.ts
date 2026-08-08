import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../common/app-logger';

export type UberRequestKind = 'token' | 'api' | 'orderDetail' | 'imageProbe';

export class UberHttpError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly reason: 'timeout' | 'network' | 'response_too_large',
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'UberHttpError';
  }
}

export type UberHttpResult<T = unknown> = {
  response: Response;
  text: string;
  data: T;
};

type UberHttpRequest = {
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
          await this.backoff(attempt);
          continue;
        }
        return result;
      } catch (error) {
        const domainError = this.toDomainError(error);
        this.logger.error(
          `[uber http] ${method} ${this.redact(url)} failed reason=${domainError.reason} retryable=${domainError.retryable}`,
        );
        if (!domainError.retryable || attempt >= attempts) throw domainError;
        await this.backoff(attempt);
      }
    }
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
      throw this.toDomainError(error);
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

  private toDomainError(error: unknown): UberHttpError {
    if (error instanceof UberHttpError) return error;
    const timeout = error instanceof Error && error.name === 'AbortError';
    return new UberHttpError(
      timeout ? 'Uber 请求超时' : 'Uber 网络请求失败',
      true,
      timeout ? 'timeout' : 'network',
      error,
    );
  }

  private async backoff(attempt: number): Promise<void> {
    const ceiling = Math.min(this.maxRetryDelayMs, 100 * 2 ** (attempt - 1));
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
