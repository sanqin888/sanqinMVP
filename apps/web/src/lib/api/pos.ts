import { apiFetch } from "@/lib/api/client";

/**
 * =========================
 * POS 订单 API（迁移到 /pos/orders/*）
 * =========================
 * 注意：
 * - 这些 helper 只给 POS 端调用（/store/pos/** 页面）。
 * - 会员/顾客端订单详情仍然走 /orders/:id/summary（不要改成 /pos/orders）。
 */

const enc = (v: string) => encodeURIComponent(v);

export async function fetchRecentOrders<T = unknown>(limit = 10) {
  return apiFetch<T>(
    `/pos/orders/recent?limit=${encodeURIComponent(String(limit))}`,
  );
}

export async function fetchOrderById<T = unknown>(id: string) {
  return apiFetch<T>(`/pos/orders/${enc(id)}`);
}

export async function updateOrderStatus<T = unknown>(
  id: string,
  status: string,
) {
  return apiFetch<T>(`/pos/orders/${enc(id)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export async function advanceOrder<T = unknown>(id: string) {
  return apiFetch<T>(`/pos/orders/${enc(id)}/advance`, {
    method: "POST",
  });
}

export type PosAdvanceResult<T> = T & {
  uberActionStatus: "PENDING" | "SUCCEEDED" | "FAILED" | null;
  retryable: boolean;
  actionId: string | null;
  errorSummary: string | null;
};

export async function retryUberOrderSync<T = unknown>(id: string) {
  return apiFetch<PosAdvanceResult<T>>(
    `/pos/orders/${enc(id)}/uber-sync/retry`,
    { method: "POST" },
  );
}

export async function denyUberOrder<T = unknown>(
  id: string,
  reasonCode: string,
  reasonDetail?: string,
) {
  return apiFetch<PosAdvanceResult<T>>(`/pos/orders/${enc(id)}/uber-deny`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reasonCode, reasonDetail }),
  });
}

export async function cancelUberOrder<T = unknown>(
  id: string,
  reason?: string,
) {
  return apiFetch<PosAdvanceResult<T>>(`/pos/orders/${enc(id)}/uber-cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

export async function fetchPosAutoAcceptSetting() {
  return apiFetch<{ enabled: boolean }>("/pos/orders/settings/auto-accept");
}

export async function updatePosAutoAcceptSetting(enabled: boolean) {
  return apiFetch<{ enabled: boolean }>("/pos/orders/settings/auto-accept", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}

export type PosExchangeRateQuote = {
  cadAmountCents: number;
  cnyAmountFen: number;
  cadToCnyRate: number;
  rateDate: string | null;
  source: "BANK_OF_CANADA" | "BUSINESS_CONFIG_FALLBACK";
};

export async function quotePosCadToCny(cadAmountCents: number) {
  return apiFetch<PosExchangeRateQuote>("/pos/exchange-rate/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cadAmountCents }),
  });
}

export type PosOrderManagementAction =
  | "SWAP_ITEM"
  | "VOID_ITEM"
  | "FULL_REFUND"
  | "CHANGE_PAYMENT"
  | "UBER_DENY"
  | "UBER_CANCEL";

export type PosOrderActionCapability = {
  action: PosOrderManagementAction;
  available: boolean;
  reason?:
    | "CLOVER_SYNC_PENDING"
    | "ORDER_REFUNDED"
    | "ORDER_NOT_SETTLED"
    | "ORDER_STATUS_NOT_SUPPORTED";
};

export async function fetchOrderActions(orderStableId: string) {
  return apiFetch<{ actions: PosOrderActionCapability[] }>(
    `/pos/orders/${enc(orderStableId)}/actions`,
  );
}

export async function fetchOrderBoard<T = unknown>(params: {
  status?: string;
  channel?: string;
  limit?: number;
  sinceMinutes?: number;
}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.channel) qs.set("channel", params.channel);
  if (typeof params.limit === "number") qs.set("limit", String(params.limit));
  if (typeof params.sinceMinutes === "number") {
    qs.set("sinceMinutes", String(params.sinceMinutes));
  }

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<T>(`/pos/orders/board${suffix}`);
}

/* ========= Amendments ========= */

export type OrderAmendmentItemAction = "VOID" | "ADD";

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
  | "RETENDER"
  | "VOID_ITEM"
  | "SWAP_ITEM"
  | "ADDITIONAL_CHARGE";

export type PaymentMethod =
  | "CASH"
  | "CARD"
  | "WECHAT_ALIPAY"
  | "STORE_BALANCE"
  | "UBEREATS";

export type CreateFullRefundInput = {
  reason: string;
  operatorName: string;
  refundAmountCents: number;
  originalPaymentMethod: PaymentMethod;
  refundMethod: PaymentMethod;
};

export type FullRefundResult<T> = {
  order: T;
  outcome: "pending_platform" | "pending_manual" | "refunded";
};

export async function createFullRefund<T = unknown>(
  orderStableId: string,
  payload: CreateFullRefundInput,
) {
  return apiFetch<FullRefundResult<T>>(
    `/pos/orders/${enc(orderStableId)}/full-refund`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export type CreateOrderAmendmentInput = {
  type: CreateOrderAmendmentType;
  reason: string;
  operatorName: string;
  refundGrossCents?: number;
  additionalChargeCents?: number;
  items?: CreateOrderAmendmentItemInput[];
  paymentMethod?: PaymentMethod | null;
  locale?: "zh" | "en";
};

export async function createOrderAmendment<T = unknown>(
  orderId: string,
  payload: CreateOrderAmendmentInput,
) {
  return apiFetch<T>(`/pos/orders/${enc(orderId)}/amendments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export type PosOrderAmendmentHistory = {
  amendmentStableId: string;
  type: CreateOrderAmendmentType;
  paymentMethod: PaymentMethod | null;
  reason: string;
  operatorName: string | null;
  deltaCents: number;
  refundCents: number;
  additionalChargeCents: number;
  summaryJson: unknown;
  items: Array<{
    action: OrderAmendmentItemAction;
    productStableId: string;
    displayName: string | null;
    nameEn: string | null;
    nameZh: string | null;
    qty: number;
    unitPriceCents: number | null;
    optionsJson: unknown;
  }>;
};

export async function fetchOrderAmendments(orderStableId: string) {
  return apiFetch<PosOrderAmendmentHistory[]>(
    `/pos/orders/${enc(orderStableId)}/amendments`,
  );
}

export async function printOrderCloud<T = unknown>(
  stableId: string,
  payload?: {
    locale?: "zh" | "en";
    targets?: { customer?: boolean; kitchen?: boolean };
    cashReceivedCents?: number;
    cashChangeCents?: number;
  },
) {
  return apiFetch<T>(`/pos/orders/${enc(stableId)}/print`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
}

export type OrderPrintStatus = {
  customerStatus: string;
  kitchenStatus: string;
  customerFailureReason?: string | null;
  kitchenFailureReason?: string | null;
} | null;

export async function fetchOrderPrintStatus(stableId: string) {
  return apiFetch<OrderPrintStatus>(
    `/pos/orders/${enc(stableId)}/print-status`,
  );
}

export async function printSummaryCloud<T = unknown>(
  params: Record<string, string>,
) {
  const qs = new URLSearchParams(params).toString();
  return apiFetch<T>(`/pos/summary/print?${qs}`, {
    method: "POST",
  });
}

export type PosCustomerOrderingStatus = {
  isTemporarilyClosed: boolean;
  autoResumeAt: string | null;
};

export async function fetchPosCustomerOrderingStatus() {
  return apiFetch<PosCustomerOrderingStatus>("/pos/store-status");
}

export async function pauseCustomerOrderingFromPos(payload: {
  durationMinutes?: number;
  untilTomorrow?: boolean;
}) {
  return apiFetch<PosCustomerOrderingStatus>("/pos/store-status/pause", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function resumeCustomerOrderingFromPos() {
  return apiFetch<PosCustomerOrderingStatus>("/pos/store-status/resume", {
    method: "POST",
  });
}
