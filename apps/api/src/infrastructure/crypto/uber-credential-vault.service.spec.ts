import { UberCredentialVaultService } from './uber-credential-vault.service';

const key = (byte: number) => Buffer.alloc(32, byte).toString('base64');

describe('UberCredentialVaultService', () => {
  it('uses an authenticated, versioned envelope without exposing plaintext', () => {
    const vault = new UberCredentialVaultService({
      UBER_CREDENTIAL_ACTIVE_KEY_VERSION: '2',
      UBER_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ 2: key(2) }),
    });
    const token = 'secret-access-token';
    const encrypted = vault.encrypt(token);
    const envelope = JSON.parse(encrypted) as Record<string, unknown>;

    expect(encrypted).not.toContain(token);
    expect(envelope).toEqual(
      expect.objectContaining({
        v: 2,
        alg: 'A256GCM',
        iv: expect.any(String),
        tag: expect.any(String),
        ciphertext: expect.any(String),
      }),
    );
    expect(vault.decrypt(encrypted)).toBe(token);
  });

  it('supports per-record rotation and rejects modified authentication tags', () => {
    const oldVault = new UberCredentialVaultService({
      UBER_CREDENTIAL_ACTIVE_KEY_VERSION: '1',
      UBER_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ 1: key(1) }),
    });
    const oldEnvelope = oldVault.encrypt('refresh-secret');
    const rotatingVault = new UberCredentialVaultService({
      UBER_CREDENTIAL_ACTIVE_KEY_VERSION: '2',
      UBER_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({
        1: key(1),
        2: key(2),
      }),
    });

    expect(rotatingVault.needsRotation(oldEnvelope)).toBe(true);
    const rotated = rotatingVault.reEncrypt(oldEnvelope);
    expect(rotatingVault.needsRotation(rotated)).toBe(false);
    expect(rotatingVault.decrypt(rotated)).toBe('refresh-secret');

    const modified = JSON.parse(rotated) as { tag: string };
    modified.tag = `${modified.tag.slice(0, -1)}A`;
    expect(() => rotatingVault.decrypt(JSON.stringify(modified))).toThrow();
  });

  it('requires production keys to declare a secrets-manager source', () => {
    expect(
      () =>
        new UberCredentialVaultService({
          NODE_ENV: 'production',
          UBER_CREDENTIAL_ACTIVE_KEY_VERSION: '1',
          UBER_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ 1: key(1) }),
        }),
    ).toThrow('secrets manager');
  });
});
