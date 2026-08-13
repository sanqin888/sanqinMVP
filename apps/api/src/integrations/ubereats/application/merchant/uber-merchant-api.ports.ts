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

/** Stable Uber subject returned by the authorization-code token exchange (`user_id`). */
export type UberOAuthIdentity = {
  uberUserId: string;
};

export type UberOAuthIdentityTokens = UberOAuthTokens & UberOAuthIdentity;

/** OAuth capability. Configuration and token endpoint details remain outside application. */
export interface UberOAuthTokenPort {
  getRedirectUri(): string;
  signState(payload: string): string;
  verifyState(payload: string, signature: string): boolean;
  buildAuthorizeUrl(state: string): string;
  exchangeAuthorizationCode(
    code: string,
    redirectUri: string,
  ): Promise<UberOAuthIdentityTokens>;
}

/** Merchant discovery capability; it translates the upstream wire model. */
export type UberMerchantIdentity = { merchantUberUserId: string };

export interface UberMerchantApiPort {
  discoverStores(identity: UberMerchantIdentity): Promise<{
    stores: UberMerchantStore[];
    raw: Record<string, unknown>;
  }>;
}

export type UberStoreWriteResult = {
  uberStoreId: string;
  ok: boolean;
  status: number | null;
  attempts: number;
  duplicate?: boolean;
  error?: string;
};

/** Store mutation capability; URL/request construction belongs to its adapter. */
export interface UberStoreApiPort {
  provisionStore(
    identity: UberMerchantIdentity,
    storeId: string,
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<Record<string, unknown>>;
  writeStatus(
    storeId: string,
    payload: Record<string, string>,
    idempotencyKey: string,
  ): Promise<UberStoreWriteResult>;
}
