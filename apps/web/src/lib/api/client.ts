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

  const payload = await readApiResponsePayload(response);

  // Only redirect when the caller explicitly accepts the shared session behavior.
  // Login/challenge screens use unauthorized="throw" so an expected 401 can be
  // rendered locally instead of causing a navigation loop.
  if (response.status === 401 && unauthorized === 'redirect') {
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      const locale = pathname.split('/')[1];
      const safeLocale = locale === 'zh' || locale === 'en' ? locale : 'en';
      const message = isApiEnvelope(payload) ? payload.message : '';

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

  return parseApiResponse<T>({
    ok: response.ok,
    status: response.status,
    method,
    url,
    payload,
    parser,
  });
}
