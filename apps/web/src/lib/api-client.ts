// apps/web/src/lib/api-client.ts

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

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

function isEnvelopeLike(v: unknown): v is ApiResponseEnvelope<unknown> {
  return isRecord(v) && typeof (v as Record<string, unknown>).code === 'string';
}

/**
 * 统一的 API 请求封装。
 * - 既兼容 {code,message,details} 信封结构，也兼容直接返回数据。
 * - 默认为同域 /api/v1 前缀；若 path 已经是 /api/... 则不再重复加前缀。
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
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
      const snippet = isRecord(p.details)
        ? ` :: ${JSON.stringify(p.details).slice(0, 160)}`
        : '';
      throw new ApiError(
        p.message || `API 错误 ${response.status}${snippet}`,
        response.status,
        payload,
      );
    }

    throw new ApiError(
      `API 错误 ${response.status}${
        typeof payload === 'string' ? ` :: ${payload.slice(0, 160)}` : ''
      }`,
      response.status,
      payload,
    );
  }

  // 成功分支：兼容信封/直返
  if (isEnvelopeLike(payload)) {
    const p = payload as ApiResponseEnvelope<unknown>;
    return (p.details as T) ?? (undefined as unknown as T);
  }

  return payload as T;
}

/**
 * =========================
 * POS 订单 API（迁移到 /pos/orders/*）
 * =========================
 * 注意：
 * - 这些 helper 只给 POS 端调用（/store/pos/** 页面）。
 * - 会员/顾客端订单详情仍然走 /orders/:id（不要改成 /pos/orders）。
 */

const enc = (v: string) => encodeURIComponent(v);

// POS: 最近订单
export async function fetchRecentOrders<T = unknown>(limit = 10) {
  return apiFetch<T>(
    `/pos/orders/recent?limit=${encodeURIComponent(String(limit))}`,
  );
}

// POS: 订单详情（按你的迁移口径：这里的 id 应该是订单 stableId）
export async function fetchOrderById<T = unknown>(id: string) {
  return apiFetch<T>(`/pos/orders/${enc(id)}`);
}

// POS: 更新订单状态
export async function updateOrderStatus<T = unknown>(id: string, status: string) {
  return apiFetch<T>(`/pos/orders/${enc(id)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

// POS: 推进状态（如 making -> ready -> completed）
export async function advanceOrder<T = unknown>(id: string) {
  return apiFetch<T>(`/pos/orders/${enc(id)}/advance`, {
    method: 'POST',
  });
}

// POS: 看板/队列（如果你前端有用到）
export async function fetchOrderBoard<T = unknown>(params: {
  status?: string; // comma-separated
  channel?: string; // comma-separated
  limit?: number;
  sinceMinutes?: number;
}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.channel) qs.set('channel', params.channel);
  if (typeof params.limit === 'number') qs.set('limit', String(params.limit));
  if (typeof params.sinceMinutes === 'number') {
    qs.set('sinceMinutes', String(params.sinceMinutes));
  }

  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch<T>(`/pos/orders/board${suffix}`);
}

/* ========= Amendments ========= */

export type OrderAmendmentItemAction = 'VOID' | 'ADD';

export type CreateOrderAmendmentItemInput = {
  action: OrderAmendmentItemAction;
  productStableId: string;
  qty: number;

  unitPriceCents?: number | null;
  displayName?: string | null;
  nameEn?: string | null;
  nameZh?: string | null;

  optionsJson?: unknown;
};

export type CreateOrderAmendmentType =
  | 'RETENDER'
  | 'VOID_ITEM'
  | 'SWAP_ITEM'
  | 'ADDITIONAL_CHARGE';

// ✅ 直接对齐后端枚举（无需映射）
export type PaymentMethod = 'CASH' | 'CARD' | 'WECHAT_ALIPAY';

export type CreateOrderAmendmentInput = {
  type: CreateOrderAmendmentType;
  reason: string;

  refundGrossCents?: number;
  additionalChargeCents?: number;

  items?: CreateOrderAmendmentItemInput[];

  paymentMethod?: PaymentMethod | null;
};

export async function createOrderAmendment<T = unknown>(
  orderId: string,
  payload: CreateOrderAmendmentInput,
) {
  return apiFetch<T>(`/pos/orders/${enc(orderId)}/amendments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
