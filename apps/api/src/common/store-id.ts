// Stable external store identity used by POS rooms, printing, Orders and
// integration mappings. The canonical Store.id is an internal UUID; this value
// maps to Store.storeStableId.
export const DEFAULT_STORE_ID = '4750_Yonge_Street';

/** Returns the server-controlled stable store identity used by POS clients. */
export function resolveConfiguredStoreId(): string {
  return process.env.STORE_ID?.trim() || DEFAULT_STORE_ID;
}
