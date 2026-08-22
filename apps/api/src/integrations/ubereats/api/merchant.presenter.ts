import {
  UBER_PUBLIC_CONTRACT_VERSION,
  toUberMutationResponse,
} from '../contracts/responses/ubereats.responses';
import type {
  UberMerchantConnectionResponse,
  UberMerchantStoresResponse,
  UberOAuthConnectResponse,
  UberStoreIntegrationConfigResponse,
} from '../contracts/responses/merchant.responses';
import { booleanOf, dateOf, recordOf, textOf } from './presenter.utils';

export const presentOAuthConnect = (
  result: unknown,
): UberOAuthConnectResponse => ({
  authorizeUrl: textOf(recordOf(result).authorizeUrl) ?? '',
  contractVersion: UBER_PUBLIC_CONTRACT_VERSION,
});

export const presentMerchantStores = (
  result: unknown,
): UberMerchantStoresResponse => {
  const source = recordOf(result);
  const stores = Array.isArray(source.stores)
    ? source.stores.map((value) => {
        const store = recordOf(value);
        return {
          storeId: textOf(store.storeId) ?? '',
          storeName: textOf(store.storeName),
          locationSummary: textOf(store.locationSummary),
          integrationEnabled: booleanOf(store.integrationEnabled),
          isProvisioned: booleanOf(store.isProvisioned),
          provisionedAt: dateOf(store.provisionedAt),
          posExternalStoreId: textOf(store.posExternalStoreId),
          isMapped: booleanOf(store.isMapped),
          mappedConnectionId: textOf(store.mappedConnectionId),
          requiresReconnect: booleanOf(store.requiresReconnect),
        };
      })
    : [];
  return {
    connectionId: textOf(source.connectionId) ?? '',
    stores,
    pageInfo: {
      limit: stores.length,
      count: stores.length,
      hasNextPage: false,
      nextCursor: null,
    },
    contractVersion: UBER_PUBLIC_CONTRACT_VERSION,
  };
};

export const presentMerchantConnection = (
  result: unknown,
): UberMerchantConnectionResponse => {
  const source = recordOf(result);
  return {
    connectionId: textOf(source.connectionId) ?? '',
    scope: textOf(source.scope),
    tokenType: textOf(source.tokenType),
    expiresAt: dateOf(source.expiresAt),
    connectedAt: dateOf(source.connectedAt) ?? '',
    contractVersion: UBER_PUBLIC_CONTRACT_VERSION,
  };
};

const nullableBooleanOf = (value: unknown): boolean | null =>
  typeof value === 'boolean' ? value : null;
const nullableRecordOf = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const presentStoreIntegrationConfig = (
  result: unknown,
): UberStoreIntegrationConfigResponse => {
  const source = recordOf(result);
  const requests = nullableRecordOf(source.allowedCustomerRequests);
  return {
    storeId: textOf(source.storeId) ?? '',
    integrationEnabled: nullableBooleanOf(source.integrationEnabled),
    allowedCustomerRequests: requests
      ? {
          allowSingleUseItemsRequests: nullableBooleanOf(
            requests.allowSingleUseItemsRequests,
          ),
          allowSpecialInstructionRequests: nullableBooleanOf(
            requests.allowSpecialInstructionRequests,
          ),
        }
      : null,
    integratorBrandId: textOf(source.integratorBrandId),
    integratorStoreId: textOf(source.integratorStoreId),
    isOrderManager: nullableBooleanOf(source.isOrderManager),
    merchantStoreId: textOf(source.merchantStoreId),
    requireManualAcceptance: nullableBooleanOf(source.requireManualAcceptance),
    storeConfigurationData: textOf(source.storeConfigurationData),
    webhooksConfig: nullableRecordOf(source.webhooksConfig),
    onlineStatus: textOf(source.onlineStatus),
    orderReleaseEnabled: nullableBooleanOf(source.orderReleaseEnabled),
    autoAcceptEnabled: nullableBooleanOf(source.autoAcceptEnabled),
    posMetadata: nullableRecordOf(source.posMetadata),
    orderManagerClientId: textOf(source.orderManagerClientId),
    isOrderManagerPending: nullableBooleanOf(source.isOrderManagerPending),
    contractVersion: UBER_PUBLIC_CONTRACT_VERSION,
  };
};

export const presentMerchantMutation = () => toUberMutationResponse();
