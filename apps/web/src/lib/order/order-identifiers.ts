//apps/web/src/lib/order/order-identifiers.ts
export type OrderIdentifiers = {
  stableId: string;              // 外部主键
  clientRequestId: string | null; // UI 主展示
  dbId?: string | null;          // 可选，仅调试/内部
};

/**
 * 把各种历史字段统一成：stableId + clientRequestId (+ dbId 可选)
 * 重点：前端后续只使用返回值的 stableId/clientRequestId
 */
export function normalizeOrderIdentifiers(raw: unknown): OrderIdentifiers {
  const data =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const stableId =
    data.stableId ??
    data.orderStableId ??
    data.stable_id ??
    data.id; // 仅用于兼容：如果旧接口把 stableId 放在 id

  if (typeof stableId !== "string" || !stableId) {
    throw new Error("Order missing stableId");
  }

  const rawClientRequestId =
    data.clientRequestId ?? data.client_request_id ?? data.orderNumber ?? null;
  const clientRequestId =
    typeof rawClientRequestId === "string" && rawClientRequestId
      ? rawClientRequestId
      : null;

  const rawDbId =
    data.dbId ?? data.internalId ?? (data.id && data.stableId ? data.id : null); // 仅在明确区分时保留
  const dbId = typeof rawDbId === "string" && rawDbId ? rawDbId : null;

  return { stableId, clientRequestId, dbId };
}
