/* eslint-disable @typescript-eslint/no-unsafe-assignment -- typed framework/Prisma test doubles cross a dynamic boundary */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { acceptanceMatrix, ContractDomain } from './contract-matrix';
import { parseUberWebhookEnvelopeV1 } from '../contracts/events/uber-webhook-envelope.v1';

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseJsonObject = (text: string): Record<string, unknown> => {
  const value: unknown = JSON.parse(text);
  if (!isJsonObject(value)) throw new Error('Expected a JSON object fixture');
  return value;
};

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
      'public-response-contract.json',
      'store-operation.json',
      'webhook-order.json',
      'webhook-signature-v1.json',
    ]);
  });

  it.each(fixtures)(
    '%s contains no real identity, address, credential or token field',
    (file) => {
      const text = readFileSync(join(fixtureDirectory, file), 'utf8');
      const payload = parseJsonObject(text);

      expect(payload).toBeDefined();
      expect(text).not.toMatch(
        /"(?:access_token|refresh_token|authorization|phone|email|address|customer_name|first_name|last_name)"\s*:/i,
      );
      expect(text).not.toMatch(/bearer\s+|@|\+?\d{10,}/i);
    },
  );
});

describe('Uber Eats webhook contract matrix payload compatibility', () => {
  it('keeps the webhook fixture compatible with the versioned envelope', () => {
    const payload = parseJsonObject(
      readFileSync(join(__dirname, 'fixtures/webhook-order.json'), 'utf8'),
    );
    expect(parseUberWebhookEnvelopeV1(payload)).toMatchObject({ version: 1 });
  });
});
