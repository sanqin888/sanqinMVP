import {
  isApiEnvelope,
  parseApiResponse,
  readApiResponsePayload,
  type PayloadParser,
} from './protocol';

export {
  ApiError,
  getApiErrorMessage,
  type ApiResponseEnvelope,
  type PayloadParser,
} from './protocol';

export type UnauthorizedBehavior = 'redirect' | 'throw';

export type ApiFetchOptions = RequestInit & {
  unauthorized?: UnauthorizedBehavior;
};

function apiUrl(path: string): string {
  return path.startsWith('/api/')
    ? path
    : path.startsWith('/')
      ? `/api/v1${path}`
      : `/api/v1/${path}`;
}

async function apiResponse(
  path: string,
  init: ApiFetchOptions = {},
  defaultAccept: string,
): Promise<{
  response: Response;
  url: string;
  method: string;
  unauthorized: UnauthorizedBehavior;
}> {
  const url = apiUrl(path);
  const { unauthorized = 'redirect', ...requestInit } = init;
  const headers = new Headers(requestInit.headers);
  if (!headers.has('Accept')) headers.set('Accept', defaultAccept);
  const method = requestInit.method ?? 'GET';
  const response = await fetch(url, {
    cache: 'no-store',
    ...requestInit,
    credentials: 'include',
    headers,
  });
  return { response, url, method, unauthorized };
}

function redirectUnauthorized(message = '') {
  if (typeof window === 'undefined') return;

  const pathname = window.location.pathname;
  const locale = pathname.split('/')[1];
  const safeLocale = locale === 'zh' || locale === 'en' ? locale : 'en';

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

/**
 * Explicit canonical raw browser adapter for binary/streaming transports.
 * Callers own MIME/status interpretation; session + same-origin API routing stay centralized here.
 */
export async function apiFetchRaw(
  path: string,
  init: ApiFetchOptions = {},
): Promise<Response> {
  const { response, unauthorized } = await apiResponse(path, init, '*/*');
  if (response.status === 401 && unauthorized === 'redirect') {
    redirectUnauthorized();
  }
  return response;
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
  const { response, url, method, unauthorized } = await apiResponse(
    path,
    init,
    'application/json',
  );

  const payload = await readApiResponsePayload(response);

  // Only redirect when the caller explicitly accepts the shared session behavior.
  // Login/challenge screens use unauthorized="throw" so an expected 401 can be
  // rendered locally instead of causing a navigation loop.
  if (response.status === 401 && unauthorized === 'redirect') {
    redirectUnauthorized(isApiEnvelope(payload) ? payload.message : '');
  }

  return parseApiResponse<T>({
    ok: response.ok,
    status: response.status,
    method,
    url,
    payload,
    parser,
  });
}
