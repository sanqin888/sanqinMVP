import { Logger } from '@nestjs/common';
import { CloverService } from './clover.service';
import { HOSTED_CHECKOUT_CURRENCY } from './dto/create-hosted-checkout.dto';

const ORIGINAL_ENV: NodeJS.ProcessEnv = process.env;
const ORIGINAL_FETCH: typeof fetch | undefined = globalThis.fetch;

describe('CloverService', () => {
  let service: CloverService;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      CLOVER_API_BASE_URL: 'https://unit.test/base/',
      CLOVER_ACCESS_TOKEN: 'secret-key',
    } as NodeJS.ProcessEnv;

    fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    globalThis.fetch = fetchMock;

    service = new CloverService();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    globalThis.fetch = ORIGINAL_FETCH;
    jest.restoreAllMocks();
  });

  it('returns redirect information when the API responds with success payload', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          redirectUrls: { href: 'https://pay.me/here' },
          checkoutSessionId: 'session-123',
        }),
        {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const result = await service.createHostedCheckout({
      amountCents: 1234,
      referenceId: 'order-42',
      description: 'Test checkout',
      returnUrl: 'https://return.here',
      metadata: { foo: 'bar' },
    });

    expect(result).toEqual({
      ok: true,
      href: 'https://pay.me/here',
      checkoutSessionId: 'session-123',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://unit.test/base/v1/hosted-checkout',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer secret-key',
        },
        body: JSON.stringify({
          currency: HOSTED_CHECKOUT_CURRENCY,
          amount: 1234,
          referenceId: 'order-42',
          description: 'Test checkout',
          returnUrl: 'https://return.here',
          metadata: { foo: 'bar' },
        }),
      }),
    );
  });

  it('returns failure when API payload lacks redirect information', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'missing redirect' }), {
        status: 400,
        statusText: 'Bad Request',
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(
      service.createHostedCheckout({
        amountCents: 500,
        referenceId: 'order-1',
        description: 'desc',
        returnUrl: 'https://return',
        metadata: {},
      }),
    ).resolves.toEqual({ ok: false, reason: 'missing redirect' });
  });

  it('logs and returns failure when fetch throws', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    fetchMock.mockRejectedValue(new Error('network-down'));

    await expect(
      service.createHostedCheckout({
        amountCents: 999,
        referenceId: 'order-2',
        description: 'desc',
        returnUrl: 'https://return',
        metadata: {},
      }),
    ).resolves.toEqual({ ok: false, reason: 'network-down' });

    expect(errorSpy).toHaveBeenCalledWith(
      'createHostedCheckout failed: network-down',
    );
  });

  it('returns early when API key is missing', async () => {
    delete process.env.CLOVER_ACCESS_TOKEN;
    service = new CloverService();

    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(
      service.createHostedCheckout({
        amountCents: 500,
        referenceId: 'order-3',
        description: 'desc',
        returnUrl: 'https://return',
        metadata: {},
      }),
    ).resolves.toEqual({ ok: false, reason: 'missing-api-key' });

    expect(errorSpy).toHaveBeenCalledWith('Clover API key is not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to status text when the API returns non-JSON body', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    fetchMock.mockResolvedValue(
      new Response('<html>Bad Gateway</html>', {
        status: 502,
        statusText: 'Bad Gateway',
        headers: { 'content-type': 'text/html' },
      }),
    );

    await expect(
      service.createHostedCheckout({
        amountCents: 100,
        referenceId: 'order-3',
        description: 'desc',
        returnUrl: 'https://return',
        metadata: {},
      }),
    ).resolves.toEqual({ ok: false, reason: 'Bad Gateway' });

    expect(warnSpy).toHaveBeenCalledWith(
      'createHostedCheckout received non-JSON error response (status 502)',
    );
  });

  it('overrides non-CAD currency requests and logs a warning', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          redirectUrls: { href: 'https://pay.me/override' },
          checkoutSessionId: 'session-override',
        }),
        {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    await service.createHostedCheckout({
      amountCents: 2500,
      currency: 'usd',
      referenceId: 'order-override',
      description: 'desc',
      returnUrl: 'https://return',
      metadata: {},
    });

    expect(warnSpy).toHaveBeenCalledWith(
      `createHostedCheckout overriding requested currency USD to ${HOSTED_CHECKOUT_CURRENCY}`,
    );

    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const init = firstCall?.[1];
    expect(init).toBeDefined();
    const body = init?.body;
    expect(typeof body).toBe('string');
    if (typeof body !== 'string') {
      throw new Error('Expected request body to be a string');
    }
    expect(JSON.parse(body)).toMatchObject({
      currency: HOSTED_CHECKOUT_CURRENCY,
      amount: 2500,
    });
  });
});
