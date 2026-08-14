export const UBER_MERCHANT_CREDENTIAL_STORE = Symbol(
  'UBER_MERCHANT_CREDENTIAL_STORE',
);

/** Infrastructure-only decrypted credential used immediately before an Uber call. */
export type UberMerchantCredential = {
  connectionId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
  tokenType: string | null;
  version: string;
};

/** Kept outside application ports so use cases cannot request plaintext tokens. */
export interface UberMerchantCredentialStore {
  loadCredential(
    connectionId: string,
  ): Promise<UberMerchantCredential | null>;
  rotateCredential(input: {
    connectionId: string;
    expectedVersion: string;
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date | null;
    scope: string | null;
    tokenType: string | null;
  }): Promise<boolean>;
}
