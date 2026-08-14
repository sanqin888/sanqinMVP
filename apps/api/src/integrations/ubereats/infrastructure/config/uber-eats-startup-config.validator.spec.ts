import { readFileSync } from 'fs';
import { resolve } from 'path';
import { validateUberEatsStartupConfig } from './uber-eats-startup-config.validator';

const key = Buffer.alloc(32, 7).toString('base64');
const credentials = {
  UBER_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ 3: key }),
  UBER_CREDENTIAL_ACTIVE_KEY_VERSION: '3',
  UBER_CREDENTIAL_KEYS_SOURCE: 'env',
};

describe('Uber Eats startup configuration', () => {
  it('injects the same non-secret runtime block into API and Worker only', () => {
    const compose = readFileSync(
      resolve(__dirname, '../../../../../../../docker-compose.yml'),
      'utf8',
    );
    const api = compose.slice(
      compose.indexOf('  api:'),
      compose.indexOf('  ubereats-worker:'),
    );
    const worker = compose.slice(
      compose.indexOf('  ubereats-worker:'),
      compose.indexOf('  web:'),
    );
    const db = compose.slice(
      compose.indexOf('  db:'),
      compose.indexOf('  api:'),
    );

    expect(api).toContain('<<: *ubereats-runtime');
    expect(worker).toContain('<<: *ubereats-runtime');
    expect(db).not.toContain('<<: *ubereats-runtime');
    expect(compose).toContain('UBER_CREDENTIAL_KEYS_SOURCE: "env"');
    expect(compose).not.toMatch(/UBER_CREDENTIAL_ENCRYPTION_KEYS:\s*["'{]/);
  });

  it('accepts production database rate limiting without Redis configuration', () => {
    expect(() =>
      validateUberEatsStartupConfig({
        NODE_ENV: 'production',
        UBER_EATS_RATE_LIMITER_MODE: 'database',
        ...credentials,
      }),
    ).not.toThrow();
  });

  it.each([
    ['array', JSON.stringify([key])],
    ['null', 'null'],
    ['string', JSON.stringify(key)],
    ['number', '3'],
  ])('rejects a %s credential key ring', (_label, value) => {
    expect(() =>
      validateUberEatsStartupConfig({
        UBER_EATS_RATE_LIMITER_MODE: 'database',
        ...credentials,
        UBER_CREDENTIAL_ENCRYPTION_KEYS: value,
      }),
    ).toThrow('普通 JSON object key ring');
  });

  it('rejects an empty credential key ring', () => {
    expect(() =>
      validateUberEatsStartupConfig({
        UBER_EATS_RATE_LIMITER_MODE: 'database',
        ...credentials,
        UBER_CREDENTIAL_ENCRYPTION_KEYS: '{}',
      }),
    ).toThrow('不得为空对象');
  });

  it.each([
    ['non-string value', JSON.stringify({ 3: 42 })],
    ['invalid version', JSON.stringify({ current: key })],
  ])('rejects a key ring with %s', (_label, value) => {
    expect(() =>
      validateUberEatsStartupConfig({
        UBER_EATS_RATE_LIMITER_MODE: 'database',
        ...credentials,
        UBER_CREDENTIAL_ENCRYPTION_KEYS: value,
      }),
    ).toThrow('格式无效');
  });

  it.each(['api', 'worker'])(
    'accepts explicit single-replica %s process mode',
    () => {
      expect(() =>
        validateUberEatsStartupConfig({
          NODE_ENV: 'production',
          UBER_EATS_RATE_LIMITER_MODE: 'process',
          UBER_EATS_SINGLE_REPLICA: 'true',
          ...credentials,
        }),
      ).not.toThrow();
    },
  );

  it('reports all missing and conflicting settings at once', () => {
    expect(() =>
      validateUberEatsStartupConfig({
        NODE_ENV: 'production',
        UBER_EATS_RATE_LIMITER_MODE: 'database',
        UBER_EATS_SINGLE_REPLICA: 'true',
      }),
    ).toThrow(
      /4 项[\s\S]*SINGLE_REPLICA[\s\S]*ENCRYPTION_KEYS[\s\S]*ACTIVE_KEY_VERSION[\s\S]*KEYS_SOURCE/,
    );
  });

  it.each([
    ['invalid base64', 'not-base64'],
    ['non-32-byte key', Buffer.alloc(31).toString('base64')],
  ])('rejects %s credential material', (_label, invalidKey) => {
    expect(() =>
      validateUberEatsStartupConfig({
        UBER_EATS_RATE_LIMITER_MODE: 'database',
        ...credentials,
        UBER_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ 3: invalidKey }),
      }),
    ).toThrow('格式无效');
  });

  it('rejects a credential key ring without its active version', () => {
    expect(() =>
      validateUberEatsStartupConfig({
        UBER_EATS_RATE_LIMITER_MODE: 'process',
        UBER_EATS_SINGLE_REPLICA: 'true',
        ...credentials,
        UBER_CREDENTIAL_ACTIVE_KEY_VERSION: '4',
      }),
    ).toThrow('不在 credential key ring 中');
  });
});
