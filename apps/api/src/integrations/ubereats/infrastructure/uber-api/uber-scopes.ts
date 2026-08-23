export const UBER_CLIENT_CREDENTIAL_SCOPES = {
  STORE: 'eats.store',
  STORE_STATUS_WRITE: 'eats.store.status.write',
  ORDER: 'eats.order',
  STORE_ORDERS_READ: 'eats.store.orders.read',
  REPORT: 'eats.report',
} as const;

export type UberClientCredentialsScope =
  (typeof UBER_CLIENT_CREDENTIAL_SCOPES)[keyof typeof UBER_CLIENT_CREDENTIAL_SCOPES];

export const UBER_MERCHANT_AUTHORIZATION_SCOPES = {
  POS_PROVISIONING: 'eats.pos_provisioning',
  /** Uber may return this auxiliary scope on merchant OAuth credentials. */
  OFFLINE_ACCESS: 'offline_access',
} as const;

export type UberMerchantAuthorizationScope =
  (typeof UBER_MERCHANT_AUTHORIZATION_SCOPES)[keyof typeof UBER_MERCHANT_AUTHORIZATION_SCOPES];

/** Merchant API capability scope; offline_access is credential metadata only. */
export type UberMerchantApiScope =
  typeof UBER_MERCHANT_AUTHORIZATION_SCOPES.POS_PROVISIONING;

export type UberOAuthScope = UberClientCredentialsScope | UberMerchantApiScope;

/** Scopes required by SanQ's current runtime capabilities. */
export const UBER_REQUIRED_CLIENT_CREDENTIAL_SCOPES = [
  UBER_CLIENT_CREDENTIAL_SCOPES.STORE,
  UBER_CLIENT_CREDENTIAL_SCOPES.ORDER,
  UBER_CLIENT_CREDENTIAL_SCOPES.STORE_STATUS_WRITE,
] as const satisfies readonly UberClientCredentialsScope[];

const CLIENT_CREDENTIAL_SCOPE_SET = new Set<string>(
  Object.values(UBER_CLIENT_CREDENTIAL_SCOPES),
);
const MERCHANT_AUTHORIZATION_SCOPE_SET = new Set<string>(
  Object.values(UBER_MERCHANT_AUTHORIZATION_SCOPES),
);

export const isUberClientCredentialsScope = (
  value: string,
): value is UberClientCredentialsScope => CLIENT_CREDENTIAL_SCOPE_SET.has(value);

export const isUberMerchantAuthorizationScope = (
  value: string,
): value is UberMerchantAuthorizationScope =>
  MERCHANT_AUTHORIZATION_SCOPE_SET.has(value);
