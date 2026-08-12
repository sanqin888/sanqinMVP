import type { UberRateLimiterPort } from '../application/shared/uber-rate-limiter.port';
import type {
  UberGatewayAuthPort,
  UberGatewayHttpPort,
  UberGatewayTransportPort,
} from '../infrastructure/uber-api/uber-api.gateway';
import type { UberHttpResult } from '../infrastructure/uber-api/uber-http.client';

export const uberHttpResult = <T extends Record<string, unknown>>(
  status: number,
  data = {} as T,
): UberHttpResult<T> => ({
  response: new Response(JSON.stringify(data), { status }),
  text: JSON.stringify(data),
  data,
});

export const createUberHttpFake = (): jest.Mocked<UberGatewayHttpPort> => ({
  request: jest.fn(),
  ensureSuccess: jest.fn(),
});

export const createUberAuthFake = (): jest.Mocked<UberGatewayAuthPort> => ({
  getAccessToken: jest.fn(),
  forceRefreshAccessToken: jest.fn(),
});

export const createUberRateLimiterFake =
  (): jest.Mocked<UberRateLimiterPort> => ({
    acquire: jest.fn(),
  });

export const createUberTransportFake =
  (): jest.Mocked<UberGatewayTransportPort> => ({
    request: jest.fn(),
    inspect: jest.fn(),
  });
