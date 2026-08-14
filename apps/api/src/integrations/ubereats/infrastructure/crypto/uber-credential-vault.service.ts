import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

type Envelope = {
  v: number;
  alg: 'A256GCM';
  iv: string;
  tag: string;
  ciphertext: string;
};

/**
 * Uber credential envelope encryption. Key material must be injected by the
 * deployment environment; it must never use NEXT_PUBLIC_* or source defaults.
 */
@Injectable()
export class UberCredentialVaultService {
  private readonly keys = new Map<number, Buffer>();
  private readonly activeVersion: number;

  constructor(environment: NodeJS.ProcessEnv = process.env) {
    this.activeVersion = Number(
      environment.UBER_CREDENTIAL_ACTIVE_KEY_VERSION ?? '0',
    );

    const serialized = environment.UBER_CREDENTIAL_ENCRYPTION_KEYS;
    if (serialized) {
      let keyRing: Record<string, string>;
      try {
        keyRing = JSON.parse(serialized) as Record<string, string>;
      } catch {
        throw new Error('Uber credential key ring 配置无效');
      }
      for (const [version, encodedKey] of Object.entries(keyRing)) {
        const key = Buffer.from(encodedKey, 'base64');
        if (key.length !== 32 || !Number.isInteger(Number(version))) {
          throw new Error('Uber credential key ring 配置无效');
        }
        this.keys.set(Number(version), key);
      }
    }

    if (environment.UBER_CREDENTIAL_KEYS_SOURCE !== 'env') {
      throw new Error('Uber credential key 必须由 environment 注入');
    }
  }

  encrypt(plaintext: string): string {
    const key = this.requireKey(this.activeVersion);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const envelope: Envelope = {
      v: this.activeVersion,
      alg: 'A256GCM',
      iv: iv.toString('base64url'),
      tag: cipher.getAuthTag().toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
    };
    return JSON.stringify(envelope);
  }

  decrypt(serializedEnvelope: string): string {
    const envelope = this.parseEnvelope(serializedEnvelope);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.requireKey(envelope.v),
      Buffer.from(envelope.iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  /** Re-encrypts one row with the active key, enabling gradual key rotation. */
  reEncrypt(serializedEnvelope: string): string {
    return this.encrypt(this.decrypt(serializedEnvelope));
  }

  needsRotation(serializedEnvelope: string): boolean {
    return this.parseEnvelope(serializedEnvelope).v !== this.activeVersion;
  }

  private requireKey(version: number): Buffer {
    const key = this.keys.get(version);
    if (!key) throw new Error('Uber credential encryption key 不可用');
    return key;
  }

  private parseEnvelope(serialized: string): Envelope {
    let value: Partial<Envelope>;
    try {
      value = JSON.parse(serialized) as Partial<Envelope>;
    } catch {
      throw new Error('Uber credential 密文格式无效');
    }
    if (
      !Number.isInteger(value.v) ||
      value.alg !== 'A256GCM' ||
      !value.iv ||
      !value.tag ||
      !value.ciphertext
    ) {
      throw new Error('Uber credential 密文格式无效');
    }
    return value as Envelope;
  }
}
