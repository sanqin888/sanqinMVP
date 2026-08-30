export const DEFAULT_STORE_STABLE_ID = '4750_Yonge_Street';

export function resolveConfiguredStoreStableId(): string {
  return process.env.STORE_ID?.trim() || DEFAULT_STORE_STABLE_ID;
}
