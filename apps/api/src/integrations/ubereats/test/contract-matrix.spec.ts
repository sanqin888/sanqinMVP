<<<<<<< HEAD
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { acceptanceMatrix, ContractDomain } from './contract-matrix';
import { parseUberWebhookEnvelopeV1 } from '../domain/webhook/uber-webhook-envelope';

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseJsonObject = (text: string): Record<string, unknown> => {
  const value: unknown = JSON.parse(text);
  if (!isJsonObject(value)) throw new Error('Expected a JSON object fixture');
  return value;
};

const domains: ContractDomain[] = [
  'merchant',
  'webhook-receive',
  'webhook-worker',
=======
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- typed framework/Prisma test doubles cross a dynamic boundary */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { acceptanceMatrix, ContractDomain } from './contract-matrix';
import { parseUberWebhookEnvelopeV1 } from '../contracts/events/uber-webhook-envelope.v1';

const domains: ContractDomain[] = [
  'merchant',
  'webhook',
>>>>>>> origin/main
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
<<<<<<< HEAD
      expect(typeof status === 'number' || status === 'not-applicable').toBe(
        true,
      );
=======
      expect(status).toEqual(expect.any(Number));
>>>>>>> origin/main
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
<<<<<<< HEAD
      const payload = parseJsonObject(text);
=======
      const payload = JSON.parse(text) as unknown;
>>>>>>> origin/main

      expect(payload).toBeDefined();
      expect(text).not.toMatch(
        /"(?:access_token|refresh_token|authorization|phone|email|address|customer_name|first_name|last_name)"\s*:/i,
      );
      expect(text).not.toMatch(/bearer\s+|@|\+?\d{10,}/i);
    },
  );
});

describe('Uber Eats webhook contract matrix payload compatibility', () => {
<<<<<<< HEAD
  it('separates HTTP ownership from asynchronous business outcomes', () => {
    const receive = acceptanceMatrix['webhook-receive'];
    const worker = acceptanceMatrix['webhook-worker'];

    expect(receive.map(([scenario]) => scenario)).toEqual(
      expect.arrayContaining([
        'invalid-signature',
        'invalid-envelope',
        'atomic-inbox-commit',
        'inbox-write-failure',
        'duplicate-event-id',
        'content-hash-dedup',
      ]),
    );
    expect(worker.map(([scenario]) => scenario)).toEqual(
      expect.arrayContaining([
        'handler-timeout',
        'invalid-business-payload',
        'unsupported-event',
        'retry-exhausted',
      ]),
    );
    expect(worker.every(([, , status]) => status === 'not-applicable')).toBe(
      true,
    );
    expect(worker.every((contract) => contract[5].includes('200'))).toBe(true);
    expect(
      receive
        .filter(([, , status]) => status !== 200)
        .every((contract) => contract[6].includes('Uber')),
    ).toBe(true);
  });

  it('keeps the webhook fixture compatible with the versioned envelope', () => {
    const payload = parseJsonObject(
=======
  it('keeps the webhook fixture compatible with the versioned envelope', () => {
    const payload = JSON.parse(
>>>>>>> origin/main
      readFileSync(join(__dirname, 'fixtures/webhook-order.json'), 'utf8'),
    );
    expect(parseUberWebhookEnvelopeV1(payload)).toMatchObject({ version: 1 });
  });
});
