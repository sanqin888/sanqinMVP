export type ApiResponseEnvelope<T> = {
  code: string;
  message?: string;
  details?: T;
};

export class ApiError extends Error {
  status: number;
  payload?: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
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

function isEnvelopeLike(v: unknown): v is ApiResponseEnvelope<unknown> {
  return isRecord(v) && typeof (v as Record<string, unknown>).code === 'string';
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
 * 统一的 API 请求封装。
 * - 既兼容 {code,message,details} 信封结构，也兼容直接返回数据。
 * - 默认为同域 /api/v1 前缀；若 path 已经是 /api/... 则不再重复加前缀。
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  parser?: PayloadParser<T>,
): Promise<T> {
  // 如果传入的是 /api/... 就直接用；否则自动加 /api/v1 前缀
  const url = path.startsWith('/api/')
    ? path
    : path.startsWith('/')
      ? `/api/v1${path}`
      : `/api/v1/${path}`;

  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  const response = await fetch(url, {
    cache: 'no-store',
    ...init,
    credentials: 'include',
    headers,
  });

  const contentType = response.headers.get('content-type') ?? '';
  let payload: unknown;

  if (contentType.includes('application/json')) {
    payload = await response.json();
  } else {
    // 非 JSON 时尽量返回文本，便于错误定位
    const text = await response.text();
    payload = { code: response.ok ? 'OK' : 'ERROR', message: text };
  }

  // 401/403：按当前路径分流到 admin / pos 登录
  if (response.status === 401 || response.status === 403) {
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      const locale = pathname.split('/')[1];
      const safeLocale = locale === 'zh' || locale === 'en' ? locale : 'en';

      if (pathname.includes('/admin')) {
        window.location.href = `/${safeLocale}/admin/login`;
      } else if (pathname.includes('/store/pos')) {
        window.location.href = `/${safeLocale}/store/pos/login`;
      }
    }
  }

  if (!response.ok) {
    if (isEnvelopeLike(payload)) {
      const p = payload as ApiResponseEnvelope<unknown>;
      const snippet = buildDetailsSnippet(p.details);
      throw new ApiError(
        `${p.message || 'API 错误'} ${response.status}${snippet} (${init.method ?? 'GET'} ${url})`,
        response.status,
        payload,
      );
    }

    throw new ApiError(
      `API 错误 ${response.status}${
        typeof payload === 'string' ? ` :: ${payload.slice(0, 160)}` : ''
      } (${init.method ?? 'GET'} ${url})`,
      response.status,
      payload,
    );
  }

  // 成功分支：兼容信封/直返
  const data = isEnvelopeLike(payload)
    ? (payload as ApiResponseEnvelope<unknown>).details
    : payload;

  if (isOperationStatusPayload(data) && !data.ok) {
    throw new ApiError(
      `${data.error || 'API operation failed'} ${response.status} (${init.method ?? 'GET'} ${url})`,
      response.status,
      payload,
    );
  }

  if (parser) {
    return parser.parse(data);
  }

  return data as T;
}
