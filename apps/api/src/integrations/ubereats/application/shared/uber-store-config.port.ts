export const UBER_STORE_CONFIG_QUERY = Symbol('UBER_STORE_CONFIG_QUERY');

export type UberStoreConfigSnapshot = {
  timezone: string;
  salesTaxRate: number;
  isTemporarilyClosed: boolean;
  temporaryCloseReason: string | null;
};

export interface UberStoreConfigQueryPort {
  getStoreConfig(): Promise<UberStoreConfigSnapshot>;
}
