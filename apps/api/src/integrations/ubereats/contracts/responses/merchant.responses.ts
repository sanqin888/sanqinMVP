import type { UberMutationResponse } from './ubereats.responses';

export class UberMerchantStoreResponse {
  storeId!: string;
  storeName!: string | null;
  locationSummary!: string | null;
  integrationEnabled!: boolean;
  isProvisioned!: boolean;
  provisionedAt!: string | null;
  posExternalStoreId!: string | null;
}

export class UberMerchantStoresResponse {
  merchantUberUserId!: string;
  stores!: UberMerchantStoreResponse[];
  pageInfo!: {
    limit: number;
    count: number;
    hasNextPage: boolean;
    nextCursor: null;
  };
  contractVersion!: '2';
}

export class UberMerchantConnectionResponse {
  merchantUberUserId!: string;
  scope!: string | null;
  tokenType!: string | null;
  expiresAt!: string | null;
  connectedAt!: string;
  contractVersion!: '2';
}

export class UberOAuthConnectResponse {
  authorizeUrl!: string;
  contractVersion!: '2';
}

export type UberMerchantMutationResponse = UberMutationResponse;
