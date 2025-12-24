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
export function normalizeOrderIdentifiers(raw: any): OrderIdentifiers {
  const stableId =
    raw?.stableId ??
    raw?.orderStableId ??
    raw?.stable_id ??
    raw?.id; // 仅用于兼容：如果旧接口把 stableId 放在 id

  if (typeof stableId !== "string" || !stableId) {
    throw new Error("Order missing stableId");
  }

  const clientRequestId =
    raw?.clientRequestId ??
    raw?.client_request_id ??
    raw?.orderNumber ??
    null;

  const dbId =
    raw?.dbId ??
    raw?.internalId ??
    (raw?.id && raw?.stableId ? raw.id : null); // 仅在明确区分时保留

  return { stableId, clientRequestId, dbId };
}
