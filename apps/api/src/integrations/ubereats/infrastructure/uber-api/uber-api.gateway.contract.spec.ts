import { Test } from '@nestjs/testing';
import type { UberGatewayRequest } from './uber-api.gateway';
import { UberApiGatewayTransport } from './uber-api.gateway';
import { UberApiConfigService } from './uber-api-config.service';
import { UberHttpClient } from './uber-http.client';
import { UberAuthService } from './uber-token.provider';
import {
  createUberAuthFake,
  createUberHttpFake,
  createUberRateLimiterFake,
  uberHttpResult,
} from '../../test/uber-api-test.helpers';

describe('Uber API gateway contract', () => {
  it('resolves its configuration through the Nest injection token', async () => {
    const module = await Test.createTestingModule({
      providers: [
        UberApiGatewayTransport,
        { provide: UberHttpClient, useValue: createUberHttpFake() },
        { provide: UberAuthService, useValue: createUberAuthFake() },
        {
          provide: UberApiConfigService,
          useValue: { apiBaseUrl: 'https://api.uber.com' },
        },
      ],
    }).compile();

    expect(module.get(UberApiGatewayTransport)).toBeInstanceOf(
      UberApiGatewayTransport,
    );
  });

  it('routes inspect through the same rate limiter and request-id pipeline', async () => {
    const inspected = uberHttpResult(200, { ok: true });
    const release = jest.fn<() => Promise<void>>().mockResolvedValue();
    const feedback = jest
      .fn<
        (result: { status: number; retryAfter: string | null }) => Promise<void>
      >()
      .mockResolvedValue();
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
    expect(limiter.acquire.mock.calls[0][0]).toEqual({
      partitionKey: 'store-1',
      operation: 'uber.store.inspect',
      weight: 3,
    });
    expect(http.request.mock.calls[0][0].headers?.['X-Request-ID']).toEqual(
      expect.any(String),
    );
    expect(feedback).toHaveBeenCalledWith({ status: 200, retryAfter: null });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('awaits cooldown feedback and release before completing', async () => {
    const limiter = createUberRateLimiterFake();
    let finishFeedback: (() => void) | undefined;
    let finishRelease: (() => void) | undefined;
    const feedback = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishFeedback = resolve;
        }),
    );
    const release = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRelease = resolve;
        }),
    );
    limiter.acquire.mockResolvedValue({ feedback, release });
    const http = createUberHttpFake();
    http.request.mockResolvedValue(uberHttpResult(429));
    const auth = createUberAuthFake();
    auth.getAccessToken.mockResolvedValue('token');
    const gateway = new UberApiGatewayTransport(
      http,
      auth,
      { apiBaseUrl: 'https://api.uber.com' },
      limiter,
    );
    const result = gateway.inspect({
      path: '/v1/eats/stores',
      operation: 'uber.store.list',
      scope: 'eats.store',
    });
    while (!feedback.mock.calls.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(release).not.toHaveBeenCalled();
    finishFeedback?.();
    while (!release.mock.calls.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(release).toHaveBeenCalledTimes(1);
    let settled = false;
    void result.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    finishRelease?.();
    await expect(result).resolves.toMatchObject({ response: { status: 429 } });
  });

  it('preserves the request error when release also fails', async () => {
    const limiter = createUberRateLimiterFake();
    limiter.acquire.mockResolvedValue({
      feedback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockRejectedValue(new Error('release failed')),
    });
    const http = createUberHttpFake();
    http.request.mockRejectedValue(new Error('upstream failed'));
    const auth = createUberAuthFake();
    auth.getAccessToken.mockResolvedValue('token');
    const gateway = new UberApiGatewayTransport(
      http,
      auth,
      { apiBaseUrl: 'https://api.uber.com' },
      limiter,
    );
    await expect(
      gateway.request({
        path: '/v1/eats/stores',
        operation: 'uber.store.list',
        scope: 'eats.store',
      }),
    ).rejects.toMatchObject({ code: 'UBER_NETWORK_ERROR' });
  });

  it('refreshes the token once on 401/403 without changing the idempotency key', async () => {
    const http = createUberHttpFake();
    http.request
      .mockResolvedValueOnce(uberHttpResult(401))
      .mockResolvedValueOnce(uberHttpResult(200, { accepted: true }));
    const auth = createUberAuthFake();
    auth.getAccessToken.mockResolvedValue('expired');
    auth.forceRefreshAccessToken.mockResolvedValue('fresh');
    const gateway = new UberApiGatewayTransport(http, auth, {
      apiBaseUrl: 'https://api.uber.com',
    });

    await expect(
      gateway.request({
        path: '/v1/delivery/order/1/accept',
        method: 'POST',
        operation: 'uber.order.accept',
        scope: 'eats.order',
        partitionKey: 'store-1',
        json: {},
        idempotencyKey: 'order-task-1:v1',
      }),
    ).resolves.toEqual({ accepted: true });
    expect(auth.forceRefreshAccessToken).toHaveBeenCalledWith('eats.order');
    const [first, second] = http.request.mock.calls.map(([request]) => request);
    expect(first.idempotencyKey).toBe('order-task-1:v1');
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(second.accessToken).toBe('fresh');
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'] as const)(
    'fails before auth/network when a %s write has no idempotency key',
    async (method) => {
      const http = createUberHttpFake();
      const auth = createUberAuthFake();
      const gateway = new UberApiGatewayTransport(http, auth, {
        apiBaseUrl: 'https://api.uber.com',
      });
      const invalidWrite = {
        path: '/v1/eats/stores/store-1/pos_data',
        method,
        operation: 'uber.store.integration-config',
        scope: 'eats.store',
      } as UberGatewayRequest;
      await expect(gateway.request(invalidWrite)).rejects.toThrow(
        '缺少幂等键',
      );
      expect(auth.getAccessToken).not.toHaveBeenCalled();
      expect(http.request).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['http://api.uber.com', '/v1/eats/stores'],
    ['https://user:secret@api.uber.com', '/v1/eats/stores'],
    ['https://api.uber.com', '//attacker.invalid/path'],
  ])('rejects unsafe base URL/path (%s, %s)', async (apiBaseUrl, path) => {
    const gateway = new UberApiGatewayTransport(
      createUberHttpFake(),
      createUberAuthFake(),
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

  it('maps a terminal HTTP failure through the centralized gateway mapper', async () => {
    const inspected = uberHttpResult(429, { code: 'rate-limit-exceeded' });
    const http = createUberHttpFake();
    http.request.mockResolvedValue(inspected);
    const auth = createUberAuthFake();
    auth.getAccessToken.mockResolvedValue('token');
    const gateway = new UberApiGatewayTransport(http, auth, {
      apiBaseUrl: 'https://api.uber.com',
    });
    await expect(
      gateway.request({
        path: '/v1/eats/stores',
        operation: 'uber.store.list',
        scope: 'eats.store',
      }),
    ).rejects.toMatchObject({
      category: 'rate-limited',
      code: 'UBER_RATE_LIMIT_EXCEEDED',
      operation: 'uber.store.list',
      upstreamStatus: null,
    });
  });
});
