/** Normalizes the local store scope used when addressing an Uber merchant. */
export function normalizeUberStoreId(storeId?: string): string {
  return storeId?.trim() || 'default';
}
