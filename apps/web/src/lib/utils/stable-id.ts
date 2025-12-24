// apps/web/src/lib/utils/stable-id.ts
export function normalizeStableId(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function pickOrderStableId(order: any): string {
  // 兼容你项目里可能出现的字段名：orderStableId / stableId / id（旧代码）
  return normalizeStableId(order?.orderStableId ?? order?.stableId ?? order?.id);
}

export function pickOrderDisplayId(order: any): string {
  // 展示优先：clientRequestId，其次旧字段（如 orderNumber），最后 stableId 短码兜底
  const display =
    normalizeStableId(order?.clientRequestId ?? order?.orderNumber ?? "");
  if (display) return display;

  const sid = pickOrderStableId(order);
  return sid ? sid.slice(0, 8) : "-";
}
