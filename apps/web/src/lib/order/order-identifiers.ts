//apps/web/src/lib/order/order-identifiers.ts
export type OrderIdentifiers = {
  stableId: string;              // 外部主键
  clientRequestId: string | null; // UI 主展示
};

/**
 * 把各种历史字段统一成：stableId + clientRequestId
 * 重点：前端后续只使用返回值的 stableId/clientRequestId
 */
export function normalizeOrderIdentifiers(raw: unknown): OrderIdentifiers {
  const data =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const stableId =
    data.stableId ??
    data.orderStableId ??
    data.stable_id ??
    data.id ??
    "";

  if (typeof stableId !== "string" || !stableId) {
    throw new Error("Order missing stableId");
  }

  const rawClientRequestId =
    data.clientRequestId ?? data.client_request_id ?? data.orderNumber ?? null;
  const clientRequestId =
    typeof rawClientRequestId === "string" && rawClientRequestId
      ? rawClientRequestId
      : null;

  return { stableId, clientRequestId };
}
