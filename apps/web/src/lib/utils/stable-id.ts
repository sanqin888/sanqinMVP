// apps/web/src/lib/utils/stable-id.ts
export function normalizeStableId(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function pickOrderStableId(order: unknown): string {
  // 兼容你项目里可能出现的字段名：orderStableId / stableId
  const data =
    typeof order === "object" && order !== null ? (order as Record<string, unknown>) : {};
  return normalizeStableId(data.orderStableId ?? data.stableId);
}

export function pickOrderDisplayId(order: unknown): string {
  // 展示优先：clientRequestId，其次旧字段（如 orderNumber），最后 stableId 短码兜底
  const data =
    typeof order === "object" && order !== null ? (order as Record<string, unknown>) : {};
  const display = normalizeStableId(data.clientRequestId ?? data.orderNumber ?? "");
  if (display) return display;

  const sid = pickOrderStableId(data);
  return sid ? sid.slice(0, 8) : "-";
}
