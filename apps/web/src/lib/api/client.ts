export type ApiResponseEnvelope<T> = {
  code: string;
  message: string;
  details: T;
};

export type UnauthorizedBehavior = 'redirect' | 'throw';

export type ApiFetchOptions = RequestInit & {
  unauthorized?: UnauthorizedBehavior;
};

export class ApiError extends Error {
  status: number;
  payload?: unknown;
  apiMessage: string;

  constructor(
    message: string,
    status: number,
    payload?: unknown,
    apiMessage = message,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
    this.apiMessage = apiMessage;
  }
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.apiMessage.trim()) {
    return error.apiMessage;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export type PayloadParser<T> = {
  parse: (input: unknown) => T;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

function isOperationStatusPayload(v: unknown): v is { ok: boolean; error?: string } {
  if (!isRecord(v) || typeof v.ok !== 'boolean') return false;
  if (v.error !== undefined && typeof v.error !== 'string') return false;
  return true;
}

function isApiEnvelope(v: unknown): v is ApiResponseEnvelope<unknown> {
  return (
    isRecord(v) &&
    typeof v.code === 'string' &&
    typeof v.message === 'string' &&
    'details' in v
  );
}

function buildDetailsSnippet(details: unknown): string {
  if (details === undefined || details === null) return '';
  if (typeof details === 'string') return ` :: ${details.slice(0, 160)}`;
  if (typeof details === 'number' || typeof details === 'boolean') {
    return ` :: ${String(details)}`;
  }
  if (isRecord(details)) {
    return ` :: ${JSON.stringify(details).slice(0, 160)}`;
  }
  try {
    return ` :: ${JSON.stringify(details).slice(0, 160)}`;
  } catch {
    return '';
  }
}

/**
 * Canonical browser API client.
 * - Regular Nest API responses must use the global {code,message,details} envelope.
 * - Binary/streaming/beacon/provider transports stay on explicit raw adapters instead.
 * - Paths default to the same-origin /api/v1 BFF prefix.
 */
export async function apiFetch<T>(
  path: string,
  init: ApiFetchOptions = {},
  parser?: PayloadParser<T>,
): Promise<T> {
  const url = path.startsWith('/api/')
    ? path
    : path.startsWith('/')
      ? `/api/v1${path}`
      : `/api/v1/${path}`;

  const { unauthorized = 'redirect', ...requestInit } = init;
  const headers = new Headers(requestInit.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  const method = requestInit.method ?? 'GET';
  const response = await fetch(url, {
    cache: 'no-store',
    ...requestInit,
    credentials: 'include',
    headers,
  });

  const contentType = response.headers.get('content-type') ?? '';
  const payload: unknown = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text();

  // Only redirect when the caller explicitly accepts the shared session behavior.
  // Login/challenge screens use unauthorized="throw" so an expected 401 can be
  // rendered locally instead of causing a navigation loop.
  if (response.status === 401 && unauthorized === 'redirect') {
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      const locale = pathname.split('/')[1];
      const safeLocale = locale === 'zh' || locale === 'en' ? locale : 'en';
      const message =
        isRecord(payload) && typeof payload.message === 'string'
          ? payload.message
          : '';

      if (pathname.includes('/admin') || pathname.includes('/accounting')) {
        if (message.includes('Admin MFA required')) {
          window.location.href = `/${safeLocale}/admin/2fa`;
        } else {
          const next = encodeURIComponent(pathname);
          window.location.href = `/${safeLocale}/admin/login?next=${next}`;
        }
      } else if (pathname.includes('/store/pos')) {
        window.location.href = `/${safeLocale}/store/pos/login`;
      }
    }
  }

  if (!response.ok) {
    if (isApiEnvelope(payload)) {
      const snippet = buildDetailsSnippet(payload.details);
      const apiMessage = payload.message || 'API 错误';
      throw new ApiError(
        `${apiMessage} ${response.status}${snippet} (${method} ${url})`,
        response.status,
        payload,
        apiMessage,
      );
    }

    const rawSnippet =
      typeof payload === 'string' && payload
        ? ` :: ${payload.slice(0, 160)}`
        : '';
    const apiMessage = `API 错误 ${response.status}`;
    throw new ApiError(
      `${apiMessage}${rawSnippet} (${method} ${url})`,
      response.status,
      payload,
      apiMessage,
    );
  }

  if (!isApiEnvelope(payload)) {
    const apiMessage = 'API response contract mismatch';
    throw new ApiError(
      `${apiMessage}: expected {code,message,details} (${method} ${url})`,
      response.status,
      payload,
      apiMessage,
    );
  }

  if (payload.code !== 'OK') {
    const apiMessage = payload.message || 'API operation failed';
    throw new ApiError(
      `${apiMessage} ${response.status} (${method} ${url})`,
      response.status,
      payload,
      apiMessage,
    );
  }

  const data = payload.details;

  if (isOperationStatusPayload(data) && !data.ok) {
    const apiMessage = data.error || 'API operation failed';
    throw new ApiError(
      `${apiMessage} ${response.status} (${method} ${url})`,
      response.status,
      payload,
      apiMessage,
    );
  }

  if (parser) {
    return parser.parse(data);
  }

  return data as T;
}
