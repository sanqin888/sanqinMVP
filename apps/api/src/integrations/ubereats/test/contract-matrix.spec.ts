import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { acceptanceMatrix, ContractDomain } from './contract-matrix';

const domains: ContractDomain[] = [
  'merchant',
  'webhook',
  'orders',
  'menu',
  'operations',
];

describe.each(domains)('Uber Eats %s integration contract', (domain) => {
  it('fixes input, persistence, outbound request, response and idempotency expectations', () => {
    for (const contract of acceptanceMatrix[domain]) {
      const [
        scenario,
        input,
        status,
        persistence,
        requests,
        response,
        idempotency,
        forbidden,
      ] = contract;
      for (const value of [
        scenario,
        input,
        persistence,
        response,
        idempotency,
      ]) {
        expect(value).toEqual(expect.any(String));
        expect(value).not.toHaveLength(0);
      }
      expect(status).toEqual(expect.any(Number));
      expect(requests).toBeDefined();
      expect(forbidden).toEqual(
        expect.arrayContaining([
          'access_token',
          'refresh_token',
          'authorization',
          'customer',
        ]),
      );
    }
  });
});

describe('Uber Eats sanitized payload fixtures', () => {
  const fixtureDirectory = join(__dirname, 'fixtures');
  const fixtures = readdirSync(fixtureDirectory).filter((file) =>
    file.endsWith('.json'),
  );

  it('keeps a fixture for every external payload family', () => {
    expect(fixtures.sort()).toEqual([
      'menu-nested-modifiers.json',
      'oauth-callback.json',
      'order-notification.json',
      'store-operation.json',
      'webhook-order.json',
    ]);
  });

  it.each(fixtures)(
    '%s contains no real identity, address, credential or token field',
    (file) => {
      const text = readFileSync(join(fixtureDirectory, file), 'utf8');
      const payload = JSON.parse(text) as unknown;

      expect(payload).toBeDefined();
      expect(text).not.toMatch(
        /"(?:access_token|refresh_token|authorization|phone|email|address|customer_name|first_name|last_name)"\s*:/i,
      );
      expect(text).not.toMatch(/bearer\s+|@|\+?\d{10,}/i);
    },
  );
});
