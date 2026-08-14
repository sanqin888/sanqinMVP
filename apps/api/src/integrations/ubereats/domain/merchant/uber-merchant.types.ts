export type UberMerchantStore = {
  storeId: string;
  storeName: string | null;
  locationSummary: string | null;
  integrationEnabled: boolean;
  posExternalStoreId: string | null;
  timezone: string | null;
};

export type UberMerchantConnectionRecord = {
  connectionId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
  tokenType: string | null;
  connectedAt: Date;
};

export type UberStoreMappingRecord = {
  connectionId: string;
  uberStoreId: string;
  storeName: string | null;
  locationSummary: string | null;
  isProvisioned: boolean;
  provisionedAt: Date | null;
  posExternalStoreId: string | null;
};

export type UpsertStoreMappingInput = {
  connectionId: string;
  uberStoreId: string;
  storeName: string | null;
  locationSummary: string | null;
  isProvisioned: boolean;
  posExternalStoreId: string | null;
  raw: Record<string, unknown>;
};
