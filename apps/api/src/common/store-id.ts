// Single-store deployment default. This must match the STORE_ID used by the
// cloud printer when it joins `store:<storeId>` in PosGateway.
export const DEFAULT_STORE_ID = '4750_Yonge_Street';

/** Returns the server-controlled store identity used by POS clients. */
export function resolveConfiguredStoreId(): string {
  return process.env.STORE_ID?.trim() || DEFAULT_STORE_ID;
}
