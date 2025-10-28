export type ApiResponseEnvelope<T> = {
  code: string;
  message: string;
  details: T;
};

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = path.startsWith('/') ? `/api/v1${path}` : `/api/v1/${path}`;
  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  const response = await fetch(url, {
    cache: 'no-store',
    ...init,
    headers,
  });

  const text = await response.text();
  let payload: ApiResponseEnvelope<T>;
  try {
    payload = text ? (JSON.parse(text) as ApiResponseEnvelope<T>) : ({} as ApiResponseEnvelope<T>);
  } catch {
    throw new Error(
      `API 返回非 JSON（status ${response.status}）：${text.slice(0, 120)}`,
    );
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('API 返回格式异常');
  }

  if (response.ok && payload.code === 'OK') {
    return payload.details ?? (null as T);
  }

  const detailSnippet =
    payload.details && typeof payload.details === 'object'
      ? ` :: ${JSON.stringify(payload.details).slice(0, 160)}`
      : '';
  throw new Error(payload.message || `API 错误 ${response.status}${detailSnippet}`);
}
