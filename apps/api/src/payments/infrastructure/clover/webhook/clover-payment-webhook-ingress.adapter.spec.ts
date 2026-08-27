import {
  PaymentWebhookAuthenticationError,
  PaymentWebhookConfigurationError,
  PaymentWebhookPayloadError,
} from '../../../application/payment-provider-webhook.port';
import { CloverProviderConfig } from '../clover-provider.config';
import { CloverPaymentWebhookIngressAdapter } from './clover-payment-webhook-ingress.adapter';

const originalEnv = {
  merchantId: process.env.CLOVER_MERCHANT_ID,
  authCode: process.env.CLOVER_WEBHOOK_AUTH_CODE,
};

const restoreEnv = (key: string, value: string | undefined) => {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
};

const createIngress = () =>
  new CloverPaymentWebhookIngressAdapter(new CloverProviderConfig());

describe('CloverPaymentWebhookIngressAdapter', () => {
  beforeEach(() => {
    process.env.CLOVER_MERCHANT_ID = 'merchant-1';
    process.env.CLOVER_WEBHOOK_AUTH_CODE = 'auth-code-1';
  });

  afterAll(() => {
    restoreEnv('CLOVER_MERCHANT_ID', originalEnv.merchantId);
    restoreEnv('CLOVER_WEBHOOK_AUTH_CODE', originalEnv.authCode);
  });

  it('accepts the Clover verification challenge before webhook auth is configured', () => {
    delete process.env.CLOVER_WEBHOOK_AUTH_CODE;
    const ingress = createIngress();

    expect(
      ingress.parseAndAuthenticate({
        payload: { verificationCode: 'verify-me' },
      }),
    ).toEqual({ kind: 'VERIFICATION', verificationCode: 'verify-me' });
  });

  it('authenticates and maps only payment notifications for the configured merchant', () => {
    const ingress = createIngress();
    const result = ingress.parseAndAuthenticate({
      authHeader: 'auth-code-1',
      payload: {
        appId: 'app-1',
        merchants: {
          'merchant-1': [
            { objectId: 'P:payment-1', type: 'UPDATE', ts: 1_777_000_000_000 },
            { objectId: 'O:order-1', type: 'UPDATE', ts: 1_777_000_000_001 },
          ],
          'merchant-2': [
            { objectId: 'P:payment-2', type: 'UPDATE', ts: 1_777_000_000_002 },
          ],
        },
      },
    });

    expect(result.kind).toBe('EVENTS');
    if (result.kind !== 'EVENTS') throw new Error('expected Clover events');
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0]).toEqual(
      expect.objectContaining({
        provider: 'CLOVER',
        merchantId: 'merchant-1',
        providerPaymentId: 'payment-1',
        operation: 'UPDATE',
        occurredAt: new Date(1_777_000_000_000),
      }),
    );
    expect(result.notifications[0]?.eventId).toMatch(/^clover_[a-f0-9]{64}$/);
  });

  it('builds the same durable event identity for an exact duplicate delivery', () => {
    const ingress = createIngress();
    const payload = {
      appId: 'app-1',
      merchants: {
        'merchant-1': [
          { objectId: 'P:payment-1', type: 'UPDATE', ts: 1_777_000_000_000 },
        ],
      },
    };

    const first = ingress.parseAndAuthenticate({
      authHeader: 'auth-code-1',
      payload,
    });
    const second = ingress.parseAndAuthenticate({
      authHeader: 'auth-code-1',
      payload,
    });

    expect(first).toEqual(second);
  });

  it('rejects an invalid Clover auth header', () => {
    const ingress = createIngress();

    expect(() =>
      ingress.parseAndAuthenticate({
        authHeader: 'wrong-code',
        payload: { appId: 'app-1', merchants: {} },
      }),
    ).toThrow(PaymentWebhookAuthenticationError);
  });

  it('rejects event delivery when webhook auth is not configured', () => {
    delete process.env.CLOVER_WEBHOOK_AUTH_CODE;
    const ingress = createIngress();

    expect(() =>
      ingress.parseAndAuthenticate({
        payload: { appId: 'app-1', merchants: {} },
      }),
    ).toThrow(PaymentWebhookConfigurationError);
  });

  it('rejects malformed payment events instead of guessing their identity', () => {
    const ingress = createIngress();

    expect(() =>
      ingress.parseAndAuthenticate({
        authHeader: 'auth-code-1',
        payload: {
          appId: 'app-1',
          merchants: {
            'merchant-1': [{ objectId: 'P:', type: 'UPDATE', ts: 123 }],
          },
        },
      }),
    ).toThrow(PaymentWebhookPayloadError);
  });
});
