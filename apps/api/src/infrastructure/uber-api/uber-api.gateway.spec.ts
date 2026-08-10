import { UberOrderGateway } from './uber-api.gateway';

describe('UberOrderGateway contract', () => {
  const auth = {
    getAccessToken: jest.fn().mockResolvedValue('merchant-token'),
    forceRefreshAccessToken: jest.fn().mockResolvedValue('refreshed-token'),
  };
  const config = {
    apiBaseUrl: 'https://test-api.uber.com/',
    resourceHrefAllowedOrigins: 'https://api.uber.com',
  };

  it('maps an allowlisted resource_href to a resource path and owns transport options', async () => {
    const request = jest.fn().mockResolvedValue({
      response: { status: 200, ok: true },
      text: '{}',
      data: { id: 'order-1' },
    });
    const gateway = new UberOrderGateway(
      { request } as never,
      auth as never,
      config as never,
    );

    const path = gateway.resourcePath(
      'https://api.uber.com/v2/eats/order/order-1',
    );
    await gateway.request(path, {
      operation: 'order.detail.read',
      scope: 'eats.store.orders.read',
      kind: 'orderDetail',
    });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://test-api.uber.com',
        path: '/v2/eats/order/order-1',
        redirect: 'error',
        operation: 'order.detail.read',
        accessToken: 'merchant-token',
      }),
    );
  });

  it.each([
    'http://api.uber.com/v2/eats/order/1',
    'https://api.uber.com:444/v2/eats/order/1',
    'https://127.0.0.1/v2/eats/order/1',
    'https://evil.example/v2/eats/order/1',
  ])('rejects unsafe resource_href %s', (href) => {
    const gateway = new UberOrderGateway(
      {} as never,
      auth as never,
      config as never,
    );
    expect(() => gateway.resourcePath(href)).toThrow(
      'Uber resource_href 不属于允许的来源',
    );
  });

  it('refreshes a merchant token once on a 401 contract response', async () => {
    const request = jest
      .fn()
      .mockResolvedValueOnce({ response: { status: 401 }, text: '', data: {} })
      .mockResolvedValueOnce({
        response: { status: 200 },
        text: '{}',
        data: {},
      });
    const gateway = new UberOrderGateway(
      { request } as never,
      auth as never,
      config as never,
    );

    await gateway.request('/v1/eats/orders/1', {
      operation: 'order.read',
      scope: 'eats.order',
      returnErrorResponse: true,
    });

    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({ accessToken: 'refreshed-token' }),
    );
  });
});
