import { UberApiGatewayTransport } from './uber-api.gateway';

const result = (status: number, data: Record<string, unknown> = {}) => ({
  response: new Response(JSON.stringify(data), { status }),
  text: JSON.stringify(data),
  data,
});

describe('Uber API gateway contract', () => {
  it('refreshes the token once on 401/403 without changing the idempotency key', async () => {
    const http = {
      request: jest
        .fn()
        .mockResolvedValueOnce(result(401))
        .mockResolvedValueOnce(result(200, { accepted: true })),
      ensureSuccess: jest.fn(),
    };
    const auth = {
      getAccessToken: jest.fn().mockResolvedValue('expired'),
      forceRefreshAccessToken: jest.fn().mockResolvedValue('fresh'),
    };
    const gateway = new UberApiGatewayTransport(http as never, auth as never, {
      apiBaseUrl: 'https://api.uber.com',
    });

    await expect(
      gateway.request({
        path: '/v1/eats/orders/1/accept_pos_order',
        method: 'POST',
        operation: 'uber.order.accept',
        scope: 'eats.order',
        partitionKey: 'store-1',
        json: {},
      }),
    ).resolves.toEqual({ accepted: true });

    expect(auth.forceRefreshAccessToken).toHaveBeenCalledWith('eats.order');
    const [first, second] = http.request.mock.calls.map(([request]) => request);
    expect(first.idempotencyKey).toMatch(/^uber-[a-f0-9]{64}$/);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(second.accessToken).toBe('fresh');
  });

  it.each([
    ['http://api.uber.com', '/v1/eats/stores'],
    ['https://user:secret@api.uber.com', '/v1/eats/stores'],
    ['https://api.uber.com', '//attacker.invalid/path'],
  ])('rejects unsafe base URL/path (%s, %s)', async (apiBaseUrl, path) => {
    const gateway = new UberApiGatewayTransport(
      { request: jest.fn(), ensureSuccess: jest.fn() } as never,
      { getAccessToken: jest.fn() } as never,
      { apiBaseUrl },
    );
    await expect(
      gateway.request({
        path,
        operation: 'uber.store.list',
        scope: 'eats.store',
      }),
    ).rejects.toThrow();
  });

  it('maps a terminal 429/5xx through the centralized safe error translator', async () => {
    const inspected = result(429);
    const translated = new Error('safe translated error');
    const http = {
      request: jest.fn().mockResolvedValue(inspected),
      ensureSuccess: jest.fn(() => {
        throw translated;
      }),
    };
    const gateway = new UberApiGatewayTransport(
      http as never,
      { getAccessToken: jest.fn().mockResolvedValue('token') } as never,
      { apiBaseUrl: 'https://api.uber.com' },
    );
    await expect(
      gateway.request({
        path: '/v1/eats/stores',
        operation: 'uber.store.list',
        scope: 'eats.store',
      }),
    ).rejects.toBe(translated);
    expect(http.ensureSuccess).toHaveBeenCalledWith(
      inspected,
      'uber.store.list',
    );
  });
});
