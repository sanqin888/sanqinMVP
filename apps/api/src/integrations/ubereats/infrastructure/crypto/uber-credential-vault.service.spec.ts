import { UberCredentialVaultService } from './uber-credential-vault.service';

const key = (byte: number) => Buffer.alloc(32, byte).toString('base64');

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseJsonObject = (text: string): Record<string, unknown> => {
  const value: unknown = JSON.parse(text);
  if (!isJsonObject(value)) throw new Error('Expected a JSON object envelope');
  return value;
};

const hasStringTag = (
  value: Record<string, unknown>,
): value is Record<string, unknown> & { tag: string } =>
  typeof value.tag === 'string';

describe('UberCredentialVaultService', () => {
  it('uses an authenticated, versioned envelope without exposing plaintext', () => {
    const vault = new UberCredentialVaultService({
      UBER_CREDENTIAL_ACTIVE_KEY_VERSION: '2',
      UBER_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ 2: key(2) }),
    });
    const token = 'secret-access-token';
    const encrypted = vault.encrypt(token);
    const envelope = parseJsonObject(encrypted);

    expect(encrypted).not.toContain(token);
    expect(envelope.v).toBe(2);
    expect(envelope.alg).toBe('A256GCM');
    expect(typeof envelope.iv).toBe('string');
    expect(typeof envelope.tag).toBe('string');
    expect(typeof envelope.ciphertext).toBe('string');
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

    const modified = parseJsonObject(rotated);
    if (!hasStringTag(modified)) {
      throw new Error('Encrypted credential envelope must contain a tag');
    }
    const modifiedTag = Buffer.from(modified.tag, 'base64url');
    modifiedTag[0] ^= 1;
    modified.tag = modifiedTag.toString('base64url');
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
