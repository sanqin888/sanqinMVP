import type { UberMerchantStore } from '../../domain/merchant/uber-merchant.types';

export const UBER_MERCHANT_API = Symbol('UBER_MERCHANT_API');
export const UBER_STORE_API = Symbol('UBER_STORE_API');
export const UBER_OAUTH_TOKEN = Symbol('UBER_OAUTH_TOKEN');
export type UberOAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
  tokenType: string | null;
};

/** OAuth capability. Configuration and token endpoint details remain outside application. */
export interface UberOAuthTokenPort {
  getRedirectUri(): string;
  signState(payload: string): string;
  verifyState(payload: string, signature: string): boolean;
  buildAuthorizeUrl(state: string): string;
  exchangeAuthorizationCode(
    code: string,
    redirectUri: string,
  ): Promise<UberOAuthTokens>;
}

/** Merchant discovery capability; it translates the upstream wire model. */
export type UberMerchantIdentity = { connectionId: string };

export interface UberMerchantApiPort {
  discoverStores(
    identity: UberMerchantIdentity,
  ): Promise<UberStoreDiscoveryResult>;
}

export type UberStoreDiscoveryResult = { stores: UberMerchantStore[] };

export type UberStoreProvisionResult = {
  storeId: string;
  status: string | null;
  storeName: string | null;
  locationSummary: string | null;
  posExternalStoreId: string | null;
};

export type UberStoreWriteResult =
  | {
      uberStoreId: string;
      outcome: 'SUCCEEDED';
      attempts: number;
      duplicate: boolean;
    }
  | {
      uberStoreId: string;
      outcome: 'FAILED';
      reason: 'UPSTREAM_REJECTED' | 'UPSTREAM_UNAVAILABLE';
      retryable: boolean;
      attempts: number;
      error: string;
    };

/** Store mutation capability; URL/request construction belongs to its adapter. */
export interface UberStoreApiPort {
  provisionStore(
    identity: UberMerchantIdentity,
    storeId: string,
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<UberStoreProvisionResult>;
  writeStatus(
    storeId: string,
    payload: Record<string, string>,
    idempotencyKey: string,
  ): Promise<UberStoreWriteResult>;
}
