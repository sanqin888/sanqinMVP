import { CloverService } from './clover.service';

const ORIGINAL_ENV = process.env;
const ORIGINAL_FETCH = global.fetch;

describe('CloverService', () => {
  let service: CloverService;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      CLOVER_API_BASE: 'https://unit.test',
      CLOVER_API_KEY: 'secret-key',
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
      currency: 'USD',
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
      'https://unit.test/v1/hosted-checkout',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer secret-key',
        },
        body: JSON.stringify({
          currency: 'USD',
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
      text: () => Promise.resolve(JSON.stringify({ message: 'missing redirect' })),
    } as unknown as Response);

    await expect(
      service.createHostedCheckout({
        amountCents: 500,
        currency: 'USD',
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
        currency: 'USD',
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
        currency: 'USD',
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
});
