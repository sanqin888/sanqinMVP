import { CloverService } from './clover.service';
import { HOSTED_CHECKOUT_CURRENCY } from './dto/create-hosted-checkout.dto';

const ORIGINAL_ENV = process.env;
const ORIGINAL_FETCH = global.fetch;

// ==== test-only helpers (typed + no-any) ====
interface CheckoutBody {
  currency: string;
  customer: Record<string, unknown>;
  shoppingCart: {
    lineItems: Array<{ name: string; price: number; unitQty: number; note?: string; taxRates?: unknown[] }>;
    defaultTaxRates: Array<{ id: string; name: string; rate: number }>;
  };
}
function getFirstCall(): [string, RequestInit] {
  const call = global.fetch && (global.fetch as jest.Mock).mock.calls[0];
  const urlRaw = call?.[0];
  const initRaw = call?.[1];
  if (typeof urlRaw !== 'string') throw new Error('fetch url is not string');
  return [urlRaw, (initRaw ?? {}) as RequestInit];
}
function parseBody(init: RequestInit): unknown {
  const b = init.body;
  if (typeof b === 'string') return JSON.parse(b) as unknown;
  if (b == null) return {} as unknown;
  // 最保守兜底（CI 下 body 只会是 string）
  return JSON.parse(String(b)) as unknown;
}

describe('CloverService', () => {
  let service: CloverService;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      // Service 读取统一 apiKey（兼容 ACCESS_TOKEN）
      CLOVER_ACCESS_TOKEN: 'secret-key',
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
    expect(body.currency).toBe(HOSTED_CHECKOUT_CURRENCY);
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
      'createHostedCheckout failed: network-down',
    );
  });

  it('returns early when API key is missing', async () => {
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

    expect(warnSpy).toHaveBeenCalledWith(
      `createHostedCheckout overriding requested currency USD to ${HOSTED_CHECKOUT_CURRENCY}`,
    );

    const [, init] = getFirstCall();
    const bodyUnknown: unknown = parseBody(init);
    const body = bodyUnknown as CheckoutBody;
    expect(body.currency).toBe(HOSTED_CHECKOUT_CURRENCY);
    expect(body.shoppingCart.lineItems[0].price).toBe(2500);
  });
});
