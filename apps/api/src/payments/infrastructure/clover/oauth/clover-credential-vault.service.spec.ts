import { CloverCredentialVaultService } from './clover-credential-vault.service';

const key = (byte: number) => Buffer.alloc(32, byte).toString('base64');

const environment = (): NodeJS.ProcessEnv => ({
  CLOVER_CREDENTIAL_ACTIVE_KEY_VERSION: '1',
  CLOVER_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ 1: key(1) }),
  CLOVER_CREDENTIAL_KEYS_SOURCE: 'env',
});

describe('CloverCredentialVaultService', () => {
  it('encrypts credentials with an authenticated versioned envelope', () => {
    const vault = new CloverCredentialVaultService(environment());
    const plaintext = 'clover-secret-token';
    const encrypted = vault.encrypt(plaintext);

    expect(vault.isConfigured()).toBe(true);
    expect(encrypted).not.toContain(plaintext);
    expect(vault.decrypt(encrypted)).toBe(plaintext);
    expect(JSON.parse(encrypted)).toMatchObject({ v: 1, alg: 'A256GCM' });
  });

  it('rejects modified authentication tags', () => {
    const vault = new CloverCredentialVaultService(environment());
    const envelope = JSON.parse(vault.encrypt('refresh-token')) as Record<
      string,
      unknown
    >;
    envelope.tag = Buffer.alloc(16, 9).toString('base64url');

    expect(() => vault.decrypt(JSON.stringify(envelope))).toThrow();
  });

  it('allows legacy startup without Clover credential encryption configuration', () => {
    const vault = new CloverCredentialVaultService({});

    expect(vault.isConfigured()).toBe(false);
    expect(() => vault.encrypt('token')).toThrow(
      'Clover credential encryption key is unavailable',
    );
  });

  it('requires configured Clover keys to come from the environment', () => {
    expect(
      () =>
        new CloverCredentialVaultService({
          CLOVER_CREDENTIAL_ACTIVE_KEY_VERSION: '1',
          CLOVER_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ 1: key(1) }),
          CLOVER_CREDENTIAL_KEYS_SOURCE: 'file',
        }),
    ).toThrow('Clover credential keys must be injected by environment');
  });
});
