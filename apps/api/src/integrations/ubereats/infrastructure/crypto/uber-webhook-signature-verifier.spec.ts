import fixture from '../../test/fixtures/webhook-signature-v1.json';
import type { UberWebhookVerificationInput } from '../../domain/webhook/uber-webhook.types';
import { HmacUberWebhookSignatureVerifier } from './uber-webhook-signature-verifier';

const deadline = Date.parse('2026-08-11T00:00:00.000Z');
const verifier = (now = deadline - 1) =>
  new HmacUberWebhookSignatureVerifier(
    {
      getWebhookSigningSecrets: () => ({
        active: fixture.activeSecret,
        previous: {
          secret: fixture.previousSecret,
          validUntilEpochMs: deadline,
        },
      }),
    },
    () => now,
  );
const input = (
  signature: string | readonly string[],
  rawBody = fixture.rawBodyUtf8,
): UberWebhookVerificationInput => ({
  version: 'hmac-sha256-hex-v1',
  headers: { 'x-uber-signature': signature },
  rawBody: new TextEncoder().encode(rawBody),
});

/** Expected digests are frozen fixture values, never produced by the implementation under test. */
describe('HmacUberWebhookSignatureVerifier', () => {
  it('accepts the fixed official-shape v1 fixture', () =>
    expect(() =>
      verifier().verify(input(fixture.activeSignatureHex)),
    ).not.toThrow());
  it('rejects a modified raw body', () =>
    expect(() =>
      verifier().verify(
        input(fixture.activeSignatureHex, `${fixture.rawBodyUtf8} `),
      ),
    ).toThrow('Uber webhook signature is invalid'));
  it('rejects incorrect encodings and algorithm prefixes', () => {
    expect(() =>
      verifier().verify(input('iKMCban4y7rx6qGzWIVC+5jNeS+M4HryHTSPj9wcU6o=')),
    ).toThrow();
    expect(() =>
      verifier().verify(input(`sha512=${fixture.activeSignatureHex}`)),
    ).toThrow();
  });
  it('rejects duplicate and comma-joined headers', () => {
    expect(() =>
      verifier().verify(
        input([fixture.activeSignatureHex, fixture.activeSignatureHex]),
      ),
    ).toThrow();
    expect(() =>
      verifier().verify(
        input(`${fixture.activeSignatureHex},${fixture.activeSignatureHex}`),
      ),
    ).toThrow();
    expect(() =>
      verifier().verify({
        ...input(fixture.activeSignatureHex),
        headers: {
          'X-Uber-Signature': fixture.activeSignatureHex,
          'x-uber-signature': fixture.activeSignatureHex,
        },
      }),
    ).toThrow();
  });
  it('accepts previous secret only inside the finite window', () => {
    expect(() =>
      verifier(deadline).verify(input(fixture.previousSignatureHex)),
    ).not.toThrow();
    expect(() =>
      verifier(deadline + 1).verify(input(fixture.previousSignatureHex)),
    ).toThrow();
  });
  it('rejects an unknown version', () =>
    expect(() =>
      verifier().verify({
        ...input(fixture.activeSignatureHex),
        version: 'hmac-sha512-hex-v2',
      } as unknown as UberWebhookVerificationInput),
    ).toThrow());
  it('returns only a safe failure classification', () => {
    try {
      verifier().verify(input('not-a-signature'));
      throw new Error('expected reject');
    } catch (error) {
      const actual = error as { code: string; message: string };
      expect(actual.code).toBe('UBER_WEBHOOK_SIGNATURE_FORMAT_INVALID');
      expect(JSON.stringify(actual)).not.toContain(fixture.activeSecret);
      expect(JSON.stringify(actual)).not.toContain(fixture.rawBodyUtf8);
      expect(JSON.stringify(actual)).not.toContain('not-a-signature');
    }
  });
});
