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
  return (
    isRecord(v) &&
    typeof (v as Record<string, unknown>).code === 'string'
  );
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

  // 失败分支：优先从信封里拿 message，否则回退到状态码/文本
  if (!response.ok) {
    if (isEnvelopeLike(payload)) {
      const p = payload as ApiResponseEnvelope<unknown>;
      const snippet =
        isRecord(p.details) ? ` :: ${JSON.stringify(p.details).slice(0, 160)}` : '';
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

/* ========= 可选：常用 helper，去掉了显式 any ========= */

export async function fetchRecentOrders<T = unknown>(limit = 10) {
  return apiFetch<T>(
    `/orders/recent?limit=${encodeURIComponent(String(limit))}`,
  );
}

export async function fetchOrderById<T = unknown>(id: string) {
  return apiFetch<T>(`/orders/${encodeURIComponent(id)}`);
}

export async function updateOrderStatus<T = unknown>(id: string, status: string) {
  return apiFetch<T>(`/orders/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export async function advanceOrder<T = unknown>(id: string) {
  return apiFetch<T>(`/orders/${encodeURIComponent(id)}/advance`, {
    method: 'POST',
  });
}
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

export type CreateOrderAmendmentInput = {
  // ✅ 对齐后端：必须告诉后端这次 amendment 的类型
  type: CreateOrderAmendmentType;

  reason: string;

  // ✅ 对齐后端：两者都可能出现（尤其 RETENDER：退款 + 新收款）
  refundGrossCents?: number;
  additionalChargeCents?: number;

  // ✅ 对齐后端：RETENDER 允许 items 为空；VOID/SWAP 通常有 items
  items?: CreateOrderAmendmentItemInput[];

  // 你现有的 paymentMethod 联合类型可以继续保留
  paymentMethod?: 'cash' | 'card' | 'wechat_alipay' | null;
};

export async function createOrderAmendment<T = unknown>(
  orderId: string,
  payload: CreateOrderAmendmentInput,
) {
  return apiFetch<T>(`/orders/${encodeURIComponent(orderId)}/amendments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
