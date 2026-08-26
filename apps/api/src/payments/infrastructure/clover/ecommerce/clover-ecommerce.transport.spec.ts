import { CloverProviderConfig } from '../clover-provider.config';
import { CloverEcommerceTransport } from './clover-ecommerce.transport';

describe('CloverEcommerceTransport', () => {
  const originalBase = process.env.CLOVER_BASE;
  const originalToken = process.env.CLOVER_ACCESS_TOKEN;

  beforeEach(() => {
    process.env.CLOVER_BASE = 'https://clover.example.test';
    process.env.CLOVER_ACCESS_TOKEN = 'test_access_token';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalBase === undefined) delete process.env.CLOVER_BASE;
    else process.env.CLOVER_BASE = originalBase;
    if (originalToken === undefined) delete process.env.CLOVER_ACCESS_TOKEN;
    else process.env.CLOVER_ACCESS_TOKEN = originalToken;
  });

  it('preserves the existing Ecommerce charge request contract', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'pay_123',
          status: 'succeeded',
          captured: true,
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    const transport = new CloverEcommerceTransport(new CloverProviderConfig());

    await expect(
      transport.createCardPayment({
        amountCents: 1024,
        currency: 'CAD',
        source: 'token_123',
        orderId: 'checkout_123',
        externalPaymentId: 'checkout_123',
        idempotencyKey: 'attempt_123',
        description: 'Online Order checkout_123',
      }),
    ).resolves.toEqual({
      ok: true,
      paymentId: 'pay_123',
      status: 'succeeded',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://clover.example.test/v1/charges',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: 'Bearer test_access_token',
          'Idempotency-Key': 'attempt_123',
        },
        body: JSON.stringify({
          amount: 1024,
          currency: 'cad',
          source: 'token_123',
          externalPaymentId: 'checkout_123',
          description: 'Online Order checkout_123',
        }),
      },
    );
  });

  it('preserves Clover decline and challenge details for the legacy Web facade', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'declined',
          error: {
            code: 'card_declined',
            message: 'Card declined',
            challenge_url: 'https://challenge.example.test/3ds',
            payment_id: 'pay_declined',
          },
        }),
        {
          status: 402,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    const transport = new CloverEcommerceTransport(new CloverProviderConfig());

    const result = await transport.createCardPayment({
      amountCents: 1024,
      currency: 'CAD',
      source: 'token_declined',
      orderId: 'checkout_declined',
    });

    expect(result).toEqual({
      ok: false,
      reason: JSON.stringify({
        status: 'declined',
        error: {
          code: 'card_declined',
          message: 'Card declined',
          challenge_url: 'https://challenge.example.test/3ds',
          payment_id: 'pay_declined',
        },
      }),
      status: 'declined',
      code: 'card_declined',
      challengeUrl: 'https://challenge.example.test/3ds',
      paymentId: 'pay_declined',
    });
  });
});
