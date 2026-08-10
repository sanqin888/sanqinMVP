import {
  UBER_PUBLIC_CONTRACT_VERSION,
  toUberMutationResponse,
} from '../contracts/responses/ubereats.responses';
import type {
  UberMerchantConnectionResponse,
  UberMerchantStoresResponse,
  UberOAuthConnectResponse,
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
        };
      })
    : [];
  return {
    merchantUberUserId: textOf(source.merchantUberUserId) ?? '',
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
    merchantUberUserId: textOf(source.merchantUberUserId) ?? '',
    scope: textOf(source.scope),
    tokenType: textOf(source.tokenType),
    expiresAt: dateOf(source.expiresAt),
    connectedAt: dateOf(source.connectedAt) ?? '',
    contractVersion: UBER_PUBLIC_CONTRACT_VERSION,
  };
};

export const presentMerchantMutation = () => toUberMutationResponse();
