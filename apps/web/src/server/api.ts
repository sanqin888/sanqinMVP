import { cookies } from 'next/headers';
import {
  ApiError,
  parseApiResponse,
  readApiResponsePayload,
  type PayloadParser,
} from '@/lib/api/protocol';

export type ServerApiFetchOptions = RequestInit & {
  forwardCookies?: boolean;
};

export function getApiUpstreamBase(): string | null {
  const upstream = process.env.API_UPSTREAM?.trim();
  return upstream ? upstream.replace(/\/$/, '') : null;
}

function normalizeApiPath(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    throw new Error('serverApiFetch only accepts SanQ API paths');
  }
  if (path.startsWith('/api/')) return path;
  return path.startsWith('/') ? `/api/v1${path}` : `/api/v1/${path}`;
}

export function buildApiUpstreamUrl(path: string): URL | null {
  const upstream = getApiUpstreamBase();
  if (!upstream) return null;
  const normalizedPath = normalizeApiPath(path);
  try {
    return new URL(normalizedPath, `${upstream}/`);
  } catch {
    return null;
  }
}

/**
 * Canonical server-side JSON API transport for App Router server components/layouts.
 * Browser code must use apiFetch() so it goes through the same-origin BFF instead.
 */
export async function serverApiFetch<T>(
  path: string,
  init: ServerApiFetchOptions = {},
  parser?: PayloadParser<T>,
): Promise<T> {
  const { forwardCookies = false, ...requestInit } = init;
  const method = requestInit.method ?? 'GET';
  const requestPath = normalizeApiPath(path);
  const upstreamUrl = buildApiUpstreamUrl(path);
  if (!upstreamUrl) {
    const apiMessage = 'API upstream is not configured';
    throw new ApiError(
      `${apiMessage} (${method} ${requestPath})`,
      500,
      null,
      apiMessage,
    );
  }

  const headers = new Headers(requestInit.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  if (forwardCookies && !headers.has('cookie')) {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore
      .getAll()
      .map(({ name, value }) => `${name}=${value}`)
      .join('; ');
    if (cookieHeader) headers.set('cookie', cookieHeader);
  }

  const response = await fetch(upstreamUrl, {
    cache: 'no-store',
    ...requestInit,
    headers,
  });
  const payload = await readApiResponsePayload(response);

  return parseApiResponse<T>({
    ok: response.ok,
    status: response.status,
    method,
    url: requestPath,
    payload,
    parser,
  });
}
