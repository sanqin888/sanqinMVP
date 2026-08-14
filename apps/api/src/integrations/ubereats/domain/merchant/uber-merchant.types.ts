export type UberMerchantStore = {
  storeId: string;
  storeName: string | null;
  locationSummary: string | null;
  integrationEnabled: boolean;
  posExternalStoreId: string | null;
  timezone: string | null;
<<<<<<< HEAD
=======
  raw: Record<string, unknown>;
>>>>>>> origin/main
};

export type UberMerchantConnectionRecord = {
  merchantUberUserId: string;
  accessToken: string;
  refreshToken: string | null;
<<<<<<< HEAD
=======
  encryptedAccessToken?: string | null;
  encryptedRefreshToken?: string | null;
>>>>>>> origin/main
  expiresAt: Date | null;
  scope: string | null;
  tokenType: string | null;
  connectedAt: Date;
<<<<<<< HEAD
=======
  rawStoresSnapshot?: unknown;
>>>>>>> origin/main
};

export type UberStoreMappingRecord = {
  merchantUberUserId: string;
  uberStoreId: string;
  storeName: string | null;
  locationSummary: string | null;
  isProvisioned: boolean;
  provisionedAt: Date | null;
  posExternalStoreId: string | null;
<<<<<<< HEAD
=======
  rawPayload?: unknown;
>>>>>>> origin/main
};

export type UpsertStoreMappingInput = {
  merchantUberUserId: string;
  uberStoreId: string;
  storeName: string | null;
  locationSummary: string | null;
  isProvisioned: boolean;
  posExternalStoreId: string | null;
  raw: Record<string, unknown>;
};
