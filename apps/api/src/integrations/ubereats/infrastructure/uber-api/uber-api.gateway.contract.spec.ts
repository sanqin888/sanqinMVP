<<<<<<< HEAD
import type { UberGatewayRequest } from './uber-api.gateway';
import { UberApiGatewayTransport } from './uber-api.gateway';
import {
  createUberAuthFake,
  createUberHttpFake,
  createUberRateLimiterFake,
  uberHttpResult,
} from '../../test/uber-api-test.helpers';

describe('Uber API gateway contract', () => {
  it('routes inspect through the same rate limiter and request-id pipeline', async () => {
    const inspected = uberHttpResult(200, { ok: true });
    const release = jest.fn<() => void>();
    const feedback =
      jest.fn<
        (result: { status: number; retryAfter: string | null }) => void
      >();
    const limiter = createUberRateLimiterFake();
    limiter.acquire.mockResolvedValue({ release, feedback });
    const http = createUberHttpFake();
    http.request.mockResolvedValue(inspected);
    const auth = createUberAuthFake();
    auth.getAccessToken.mockResolvedValue('token');
    const gateway = new UberApiGatewayTransport(
      http,
      auth,
      {
        apiBaseUrl: 'https://api.uber.com',
        operationWeight: () => 3,
      },
=======
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- typed framework/Prisma test doubles cross a dynamic boundary */
import { UberApiGatewayTransport } from './uber-api.gateway';

const result = (status: number, data: Record<string, unknown> = {}) => ({
  response: new Response(JSON.stringify(data), { status }),
  text: JSON.stringify(data),
  data,
});

describe('Uber API gateway contract', () => {
  it('routes inspect through the same rate limiter and request-id pipeline', async () => {
    const inspected = result(200, { ok: true });
    const release = jest.fn();
    const feedback = jest.fn();
    const limiter = {
      acquire: jest.fn().mockResolvedValue({ release, feedback }),
    };
    const http = {
      request: jest.fn().mockResolvedValue(inspected),
      ensureSuccess: jest.fn(),
    };
    const config = {
      apiBaseUrl: 'https://api.uber.com',
      operationWeight: () => 3,
    };
    const gateway = new UberApiGatewayTransport(
      http as never,
      { getAccessToken: jest.fn().mockResolvedValue('token') } as never,
      config,
>>>>>>> origin/main
      limiter,
    );

    await expect(
      gateway.inspect({
        path: '/v1/eats/stores/1',
        operation: 'uber.store.inspect',
        scope: 'eats.store',
        partitionKey: 'store-1',
      }),
    ).resolves.toBe(inspected);
<<<<<<< HEAD
    expect(limiter.acquire.mock.calls[0][0]).toEqual({
=======
    expect(limiter.acquire).toHaveBeenCalledWith({
>>>>>>> origin/main
      partitionKey: 'store-1',
      operation: 'uber.store.inspect',
      weight: 3,
    });
<<<<<<< HEAD
    expect(http.request.mock.calls[0][0].headers?.['X-Request-ID']).toEqual(
=======
    expect(http.request.mock.calls[0][0].headers['X-Request-ID']).toEqual(
>>>>>>> origin/main
      expect.any(String),
    );
    expect(feedback).toHaveBeenCalledWith({ status: 200, retryAfter: null });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('refreshes the token once on 401/403 without changing the idempotency key', async () => {
<<<<<<< HEAD
    const http = createUberHttpFake();
    http.request
      .mockResolvedValueOnce(uberHttpResult(401))
      .mockResolvedValueOnce(uberHttpResult(200, { accepted: true }));
    const auth = createUberAuthFake();
    auth.getAccessToken.mockResolvedValue('expired');
    auth.forceRefreshAccessToken.mockResolvedValue('fresh');
    const gateway = new UberApiGatewayTransport(http, auth, {
=======
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
>>>>>>> origin/main
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
        idempotencyKey: 'order-task-1:v1',
      }),
    ).resolves.toEqual({ accepted: true });
<<<<<<< HEAD
=======

>>>>>>> origin/main
    expect(auth.forceRefreshAccessToken).toHaveBeenCalledWith('eats.order');
    const [first, second] = http.request.mock.calls.map(([request]) => request);
    expect(first.idempotencyKey).toBe('order-task-1:v1');
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(second.accessToken).toBe('fresh');
  });

  it('fails before auth/network when a write has no idempotency key', async () => {
<<<<<<< HEAD
    const http = createUberHttpFake();
    const auth = createUberAuthFake();
    const gateway = new UberApiGatewayTransport(http, auth, {
      apiBaseUrl: 'https://api.uber.com',
    });
    const invalidWrite = {
      path: '/v1/eats/stores/store-1/status',
      method: 'POST',
      operation: 'uber.store.status',
      scope: 'eats.store.status.write',
    } as UberGatewayRequest;
    await expect(gateway.request(invalidWrite)).rejects.toThrow('缺少幂等键');
=======
    const http = { request: jest.fn(), ensureSuccess: jest.fn() };
    const auth = { getAccessToken: jest.fn() };
    const gateway = new UberApiGatewayTransport(http as never, auth as never, {
      apiBaseUrl: 'https://api.uber.com',
    });

    await expect(
      gateway.request({
        path: '/v1/eats/stores/store-1/status',
        method: 'POST',
        operation: 'uber.store.status',
        scope: 'eats.store.status.write',
      } as never),
    ).rejects.toThrow('缺少幂等键');
>>>>>>> origin/main
    expect(auth.getAccessToken).not.toHaveBeenCalled();
    expect(http.request).not.toHaveBeenCalled();
  });

  it.each([
    ['http://api.uber.com', '/v1/eats/stores'],
    ['https://user:secret@api.uber.com', '/v1/eats/stores'],
    ['https://api.uber.com', '//attacker.invalid/path'],
  ])('rejects unsafe base URL/path (%s, %s)', async (apiBaseUrl, path) => {
    const gateway = new UberApiGatewayTransport(
<<<<<<< HEAD
      createUberHttpFake(),
      createUberAuthFake(),
=======
      { request: jest.fn(), ensureSuccess: jest.fn() } as never,
      { getAccessToken: jest.fn() } as never,
>>>>>>> origin/main
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

<<<<<<< HEAD
  it('maps a terminal HTTP failure through the centralized gateway mapper', async () => {
    const inspected = uberHttpResult(429, { code: 'rate-limit-exceeded' });
    const http = createUberHttpFake();
    http.request.mockResolvedValue(inspected);
    const auth = createUberAuthFake();
    auth.getAccessToken.mockResolvedValue('token');
    const gateway = new UberApiGatewayTransport(http, auth, {
      apiBaseUrl: 'https://api.uber.com',
    });
=======
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
>>>>>>> origin/main
    await expect(
      gateway.request({
        path: '/v1/eats/stores',
        operation: 'uber.store.list',
        scope: 'eats.store',
      }),
<<<<<<< HEAD
    ).rejects.toMatchObject({
      category: 'rate-limited',
      code: 'UBER_RATE_LIMIT_EXCEEDED',
      operation: 'uber.store.list',
      upstreamStatus: null,
    });
=======
    ).rejects.toBe(translated);
    expect(http.ensureSuccess).toHaveBeenCalledWith(
      inspected,
      'uber.store.list',
    );
>>>>>>> origin/main
  });
});
