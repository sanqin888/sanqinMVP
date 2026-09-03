export const UBER_STORE_CONFIG_QUERY = Symbol('UBER_STORE_CONFIG_QUERY');

export type UberStoreConfigSnapshot = {
  timezone: string;
  salesTaxRate: number;
  isTemporarilyClosed: boolean;
  temporaryCloseReason: string | null;
};

export type UberStoreAllergyPolicy = {
  mode: 'RELAY_ALL' | 'DENY_LIST' | 'DENY_ALL';
  unsupportedAllergens: string[];
};

export interface UberStoreConfigQueryPort {
  getStoreConfig(storeStableId: string): Promise<UberStoreConfigSnapshot>;
  getStoreAllergyPolicy(storeStableId: string): Promise<UberStoreAllergyPolicy>;
  getStoreAutoAcceptOnlineOrders(storeStableId: string): Promise<boolean>;
}
