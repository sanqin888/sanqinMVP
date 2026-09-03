/** Requires an explicit store reference for store-scoped Uber operations. */
export function requireUberStoreId(storeId?: string): string {
  const normalized = storeId?.trim();
  if (!normalized) throw new TypeError('storeId must not be empty');
  return normalized;
}
