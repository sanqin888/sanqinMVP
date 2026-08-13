import { readFileSync } from 'fs';
import { resolve } from 'path';
import { validateUberEatsStartupConfig } from './uber-eats-startup-config.validator';

const key = Buffer.alloc(32, 7).toString('base64');
const credentials = {
  UBER_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ 3: key }),
  UBER_CREDENTIAL_ACTIVE_KEY_VERSION: '3',
  UBER_CREDENTIAL_KEYS_SOURCE: 'secrets-manager',
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
    expect(compose).toContain('UBER_CREDENTIAL_KEYS_SOURCE: "secrets-manager"');
    expect(compose).not.toMatch(/UBER_CREDENTIAL_ENCRYPTION_KEYS:\s*["'{]/);
  });

  it('accepts production distributed rate limiting', () => {
    expect(() =>
      validateUberEatsStartupConfig({
        NODE_ENV: 'production',
        UBER_EATS_RATE_LIMITER_MODE: 'distributed',
        UBER_EATS_RATE_LIMIT_REDIS_HTTP_URL: 'https://redis.example',
        UBER_EATS_RATE_LIMIT_REDIS_HTTP_TOKEN: 'token',
        ...credentials,
      }),
    ).not.toThrow();
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
        UBER_EATS_RATE_LIMITER_MODE: 'distributed',
        UBER_EATS_SINGLE_REPLICA: 'true',
      }),
    ).toThrow(
      /6 项[\s\S]*REDIS_HTTP_URL[\s\S]*REDIS_HTTP_TOKEN[\s\S]*SINGLE_REPLICA[\s\S]*ENCRYPTION_KEYS[\s\S]*ACTIVE_KEY_VERSION[\s\S]*KEYS_SOURCE/,
    );
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
