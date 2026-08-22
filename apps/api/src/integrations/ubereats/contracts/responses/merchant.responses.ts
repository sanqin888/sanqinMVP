import type { UberMutationResponse } from './ubereats.responses';

export class UberMerchantStoreResponse {
  storeId!: string;
  storeName!: string | null;
  locationSummary!: string | null;
  integrationEnabled!: boolean;
  isProvisioned!: boolean;
  provisionedAt!: string | null;
  posExternalStoreId!: string | null;
  isMapped!: boolean;
  mappedConnectionId!: string | null;
  requiresReconnect!: boolean;
}

export class UberMerchantStoresResponse {
  connectionId!: string;
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
  connectionId!: string;
  scope!: string | null;
  tokenType!: string | null;
  expiresAt!: string | null;
  connectedAt!: string;
  contractVersion!: '2';
}

export class UberStoreStatusResponse {
  storeId!: string;
  status!: string;
  offlineReason!: string | null;
  offlineReasonMetadata!: string | null;
  isOfflineUntil!: string | null;
  contractVersion!: '2';
}

export class UberStorePrepTimeResponse {
  storeId!: string;
  defaultPrepTimeSeconds!: number;
  contractVersion!: '2';
}

export class UberStoreIntegrationConfigResponse {
  storeId!: string;
  integrationEnabled!: boolean | null;
  allowedCustomerRequests!: {
    allowSingleUseItemsRequests: boolean | null;
    allowSpecialInstructionRequests: boolean | null;
  } | null;
  integratorBrandId!: string | null;
  integratorStoreId!: string | null;
  isOrderManager!: boolean | null;
  merchantStoreId!: string | null;
  requireManualAcceptance!: boolean | null;
  storeConfigurationData!: string | null;
  webhooksConfig!: Record<string, unknown> | null;
  onlineStatus!: string | null;
  orderReleaseEnabled!: boolean | null;
  autoAcceptEnabled!: boolean | null;
  posMetadata!: Record<string, unknown> | null;
  orderManagerClientId!: string | null;
  isOrderManagerPending!: boolean | null;
  contractVersion!: '2';
}

export class UberOAuthConnectResponse {
  authorizeUrl!: string;
  contractVersion!: '2';
}

export type UberMerchantMutationResponse = UberMutationResponse;
