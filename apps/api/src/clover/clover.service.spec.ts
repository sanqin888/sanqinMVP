import { CloverService } from './clover.service';
import { HOSTED_CHECKOUT_CURRENCY } from './dto/create-hosted-checkout.dto';

const ORIGINAL_ENV = process.env;
const ORIGINAL_FETCH = global.fetch;

describe('CloverService', () => {
  let service: CloverService;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      CLOVER_API_BASE_URL: 'https://unit.test/base/',
      CLOVER_ACCESS_TOKEN: 'secret-key',
    };

    fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    global.fetch = fetchMock;

    service = new CloverService();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    global.fetch = ORIGINAL_FETCH;
    jest.restoreAllMocks();
  });

  it('returns redirect information when the API responds with success payload', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () =>
        Promise.resolve(
          JSON.stringify({
            redirectUrls: { href: 'https://pay.me/here' },
            checkoutSessionId: 'session-123',
          }),
        ),
    } as unknown as Response);

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
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: () =>
        Promise.resolve(JSON.stringify({ message: 'missing redirect' })),
    } as unknown as Response);

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
    const errorSpy = jest.spyOn<any, any>(service['logger'], 'error');
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

    const errorSpy = jest.spyOn<any, any>(service['logger'], 'error');

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
    const warnSpy = jest.spyOn<any, any>(service['logger'], 'warn');

    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: () => Promise.resolve('<html>Bad Gateway</html>'),
    } as unknown as Response);

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
    const warnSpy = jest.spyOn<any, any>(service['logger'], 'warn');

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () =>
        Promise.resolve(
          JSON.stringify({
            redirectUrls: { href: 'https://pay.me/override' },
            checkoutSessionId: 'session-override',
          }),
        ),
    } as unknown as Response);

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

    const [, init] = fetchMock.mock.calls[0];
    expect(init).toBeDefined();
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      currency: HOSTED_CHECKOUT_CURRENCY,
      amount: 2500,
    });
  });
});
