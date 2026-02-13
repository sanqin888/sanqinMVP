import { apiFetch } from '@/lib/api/client';

/**
 * =========================
 * POS 订单 API（迁移到 /pos/orders/*）
 * =========================
 * 注意：
 * - 这些 helper 只给 POS 端调用（/store/pos/** 页面）。
 * - 会员/顾客端订单详情仍然走 /orders/:id/summary（不要改成 /pos/orders）。
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
export type PaymentMethod = 'CASH' | 'CARD' | 'WECHAT_ALIPAY' | 'STORE_BALANCE';

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

// POS: 云端打印订单
export async function printOrderCloud<T = unknown>(
  stableId: string,
  targets?: { customer?: boolean; kitchen?: boolean },
) {
  return apiFetch<T>(`/pos/orders/${enc(stableId)}/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(targets ? { targets } : {}),
  });
}

// POS: 云端打印当日小结
export async function printSummaryCloud<T = unknown>(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return apiFetch<T>(`/pos/summary/print?${qs}`, {
    method: 'POST',
  });
}
