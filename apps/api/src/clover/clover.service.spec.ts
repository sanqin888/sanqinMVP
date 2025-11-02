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
      // 当前 Service 不再读取 CLOVER_API_BASE_URL，这里留着不影响
      CLOVER_API_BASE_URL: 'https://unit.test/base/',
      // API 凭证（当前实现兼容 PRIVATE_TOKEN / API_KEY / ACCESS_TOKEN）
      CLOVER_ACCESS_TOKEN: 'secret-key',
      // 当前 Service 需要的额外 env
      CLOVER_MERCHANT_ID: 'MID-UNIT',
      CLOVER_TAX_ID: 'TAX-UNIT',
      SALES_TAX_NAME: 'HST',
      SALES_TAX_RATE: '0.13',      // 13%
      PRICES_INCLUDE_TAX: 'false', // 测试里传入的是税前价
      CLOVER_ENV: 'sandbox',
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
    // 当前 service 读取 data.href / data.checkoutSessionId
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

    // URL：当前实现使用 invoicing checkout 端点
    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(typeof url).toBe('string');
    expect(String(url)).toContain('/invoicingcheckoutservice/v1/checkouts');

    // Headers：注意大小写与 X-Clover-Merchant-Id
    expect(init).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-key',
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Clover-Merchant-Id': 'MID-UNIT',
        }),
      }),
    );

    // Body：当前实现有 currency + shoppingCart（含 lineItems/defaultTaxRates）
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.currency).toBe(HOSTED_CHECKOUT_CURRENCY);
    expect(body.shoppingCart).toEqual(
      expect.objectContaining({
        lineItems: expect.any(Array),
        defaultTaxRates: expect.arrayContaining([
          expect.objectContaining({ id: 'TAX-UNIT', name: 'HST' }),
        ]),
      }),
    );
    // 第一条行项目的 price 应等于传入的 amountCents（税前）
    expect(body.shoppingCart.lineItems[0]).toEqual(
      expect.objectContaining({
        price: 1234,
        unitQty: 1,
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

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.currency).toBe(HOSTED_CHECKOUT_CURRENCY);
    // 金额现在位于 lineItems 里（税前）
    expect(body.shoppingCart.lineItems[0].price).toBe(2500);
  });
});
