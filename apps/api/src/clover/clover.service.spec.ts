import { CloverService } from './clover.service';

const ORIGINAL_ENV = process.env;
const ORIGINAL_FETCH = global.fetch;

// ==== test-only helpers (typed + no-any) ====
interface CheckoutBody {
  customer: Record<string, unknown>;
  shoppingCart: {
    lineItems: Array<{
      name: string;
      price: number;
      unitQty: number;
      note?: string;
      taxRates?: unknown[];
    }>;
    defaultTaxRates: Array<{ id: string; name: string; rate: number }>;
  };
}
function getFirstCall(): [string, RequestInit] {
  if (!global.fetch) throw new Error('fetch not mocked');
  const fetchFn = global.fetch as jest.MockedFunction<typeof fetch>;
  const call = fetchFn.mock.calls[0];
  const urlRaw = call?.[0];
  const initRaw = call?.[1];
  if (typeof urlRaw !== 'string') throw new Error('fetch url is not string');
  const init = initRaw ?? {};
  return [urlRaw, init];
}
function parseBody(init: RequestInit): unknown {
  const b = init.body;
  if (typeof b === 'string') return JSON.parse(b) as unknown;
  if (b == null) return {} as unknown;
  throw new Error('Request body is not a string');
}

describe('CloverService', () => {
  let service: CloverService;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      CLOVER_PRIVATE_TOKEN: 'secret-key',
      CLOVER_MERCHANT_ID: 'MID-UNIT',
      CLOVER_TAX_ID: 'TAX-UNIT',
      SALES_TAX_NAME: 'HST',
      SALES_TAX_RATE: '0.13',
      PRICES_INCLUDE_TAX: 'false',
      CLOVER_ENV: 'sandbox',
    };

    fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    global.fetch = fetchMock as unknown as typeof fetch;

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
            href: 'https://pay.me/here',
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

    const [url, init] = getFirstCall();
    expect(url).toContain('/invoicingcheckoutservice/v1/checkouts');

    // Headers（大小写与 X-Clover-Merchant-Id）
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer secret-key');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Accept).toBe('application/json');
    expect(headers['X-Clover-Merchant-Id']).toBe('MID-UNIT');

    // Body
    const bodyUnknown: unknown = parseBody(init);
    const body = bodyUnknown as CheckoutBody;
    expect(Array.isArray(body.shoppingCart.lineItems)).toBe(true);
    expect(Array.isArray(body.shoppingCart.defaultTaxRates)).toBe(true);
    expect(body.shoppingCart.defaultTaxRates[0]).toEqual(
      expect.objectContaining({ id: 'TAX-UNIT', name: 'HST' }),
    );
    expect(body.shoppingCart.lineItems[0]).toEqual(
      expect.objectContaining({ price: 1234, unitQty: 1 }),
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
      'createHostedCheckout exception: network-down',
    );
  });

  it('returns early when private token is missing', async () => {
    delete process.env.CLOVER_ACCESS_TOKEN;
    delete process.env.CLOVER_API_KEY;
    delete process.env.CLOVER_PRIVATE_TOKEN;
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
    ).resolves.toEqual({ ok: false, reason: 'missing-private-key' });

    expect(errorSpy).not.toHaveBeenCalled();
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
      expect.stringContaining(
        'createHostedCheckout non-JSON response captured:',
      ),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('createHostedCheckout failed: status=502'),
    );
  });

  it('builds the request body when a non-CAD currency is supplied', async () => {
    const warnSpy = jest.spyOn<any, any>(service['logger'], 'warn');

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () =>
        Promise.resolve(
          JSON.stringify({
            href: 'https://pay.me/override',
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

    expect(warnSpy).not.toHaveBeenCalled();

    const [, init] = getFirstCall();
    const bodyUnknown: unknown = parseBody(init);
    const body = bodyUnknown as CheckoutBody;
    expect(body.shoppingCart.lineItems[0].price).toBe(2500);
  });
});
