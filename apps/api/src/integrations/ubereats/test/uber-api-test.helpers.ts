import type { UberRateLimiterPort } from '../application/ports/uber-rate-limiter.port';
import type {
  UberGatewayAuthPort,
  UberGatewayHttpPort,
  UberGatewayTransportPort,
} from '../infrastructure/uber-api/uber-api.gateway';
import type {
  UberHttpRequest,
  UberHttpResult,
} from '../infrastructure/uber-api/uber-http.client';

export const uberHttpResult = <T extends Record<string, unknown>>(
  status: number,
  data = {} as T,
): UberHttpResult<T> => ({
  response: new Response(JSON.stringify(data), { status }),
  text: JSON.stringify(data),
  data,
});

export const createUberHttpFake = (): jest.Mocked<UberGatewayHttpPort> => ({
  request:
    jest.fn<
      <T = unknown>(request: UberHttpRequest) => Promise<UberHttpResult<T>>
    >(),
  ensureSuccess: jest.fn<UberGatewayHttpPort['ensureSuccess']>(),
});

export const createUberAuthFake = (): jest.Mocked<UberGatewayAuthPort> => ({
  getAccessToken: jest.fn<(scope?: string) => Promise<string>>(),
  forceRefreshAccessToken: jest.fn<(scope?: string) => Promise<string>>(),
});

export const createUberRateLimiterFake =
  (): jest.Mocked<UberRateLimiterPort> => ({
    acquire: jest.fn<UberRateLimiterPort['acquire']>(),
  });

export const createUberTransportFake =
  (): jest.Mocked<UberGatewayTransportPort> => ({
    request: jest.fn<UberGatewayTransportPort['request']>(),
    inspect: jest.fn<UberGatewayTransportPort['inspect']>(),
  });
