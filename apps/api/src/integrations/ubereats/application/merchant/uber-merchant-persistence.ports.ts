export interface UberOAuthStatePort {
  saveOAuthState(input: {
    nonce: string;
    adminSessionId: string;
    issuedAt: Date;
    expiresAt: Date;
    redirectUri: string;
    merchantContext: string | null;
  }): Promise<void>;
  findOAuthState(nonce: string): Promise<{
    nonce: string;
    adminSessionId: string;
    redirectUri: string;
    issuedAt: Date;
    expiresAt: Date;
    consumedAt: Date | null;
    merchantContext: string | null;
    status: string;
    retryCount: number;
    lastErrorCategory: string | null;
    uberUserId: string | null;
    scope: string | null;
    tokenType: string | null;
    tokenExpiresAt: Date | null;
    connectedAt: Date | null;
  } | null>;
  claimOAuthState(input: {
    nonce: string;
    adminSessionId: string;
    issuedAt: Date;
    now: Date;
  }): Promise<boolean>;
  releaseOAuthStateForRetry(nonce: string, category: string): Promise<boolean>;
  failOAuthState(nonce: string, category: string): Promise<boolean>;
  saveExchangedTokens(input: {
    nonce: string;
    uberUserId: string;
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date | null;
    scope: string | null;
    tokenType: string | null;
  }): Promise<boolean>;
  loadExchangedTokens(nonce: string): Promise<{
    uberUserId: string;
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date | null;
    scope: string | null;
    tokenType: string | null;
  } | null>;
  completeOAuthState(nonce: string, connectedAt: Date): Promise<boolean>;
}

export type UberMerchantConnection = {
  merchantUberUserId: string;
  expiresAt: Date | null;
  scope: string | null;
  tokenType: string | null;
  connectedAt: Date;
  rawStoresSnapshot: unknown;
};

export interface UberMerchantConnectionRepositoryPort {
  /** Application-safe connection metadata. Decrypted credentials never cross this port. */
  findConnection(
    merchantUberUserId?: string,
  ): Promise<UberMerchantConnection | null>;
  upsertConnectionByUberUserId(input: {
    uberUserId: string;
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date | null;
    scope: string | null;
    tokenType: string | null;
    connectedAt: Date;
    rawStoresSnapshot?: unknown;
  }): Promise<{ connectedAt: Date }>;
  saveStoresSnapshot(
    merchantUberUserId: string,
    raw: Record<string, unknown>,
  ): Promise<void>;
}

export type UberMerchantStoreMapping = {
  merchantUberUserId: string;
  uberStoreId: string;
  storeName: string | null;
  locationSummary: string | null;
  isProvisioned: boolean;
  provisionedAt: Date | null;
  posExternalStoreId: string | null;
  rawPayload?: unknown;
};

export interface UberStoreMappingRepositoryPort {
  findMappings(
    merchantUberUserId: string,
    uberStoreIds: string[],
  ): Promise<UberMerchantStoreMapping[]>;
  listMappings(): Promise<UberMerchantStoreMapping[]>;
  findMapping(uberStoreId: string): Promise<UberMerchantStoreMapping | null>;
  saveDiscovery(input: UberMerchantStoreMapping): Promise<void>;
  upsertMapping(
    input: UberMerchantStoreMapping,
  ): Promise<UberMerchantStoreMapping>;
  updatePosExternalStoreId(
    uberStoreId: string,
    posExternalStoreId: string,
  ): Promise<UberMerchantStoreMapping | null>;
}

export const UBER_OAUTH_STATE_REPOSITORY = Symbol(
  'UBER_OAUTH_STATE_REPOSITORY',
);
export const UBER_MERCHANT_CONNECTION_REPOSITORY = Symbol(
  'UBER_MERCHANT_CONNECTION_REPOSITORY',
);
export const UBER_STORE_MAPPING_REPOSITORY = Symbol(
  'UBER_STORE_MAPPING_REPOSITORY',
);
