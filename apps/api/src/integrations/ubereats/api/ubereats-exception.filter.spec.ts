import { HttpStatus } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import {
  UberAuthenticationError,
  UberRateLimitedError,
  UberTransientUpstreamError,
  UberValidationError,
} from '../application/shared/uber-application.error';
import { UberEatsExceptionFilter } from './ubereats-exception.filter';

describe('UberEatsExceptionFilter', () => {
  const present = (error: Parameters<UberEatsExceptionFilter['catch']>[0]) => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status, setHeader: jest.fn() }),
        getRequest: () => ({ headers: { 'x-correlation-id': 'contract' } }),
      }),
    } as unknown as ArgumentsHost;
    new UberEatsExceptionFilter().catch(error, host);
    return status.mock.calls[0][0];
  };

  it.each([
    [
      'upstream 5xx',
      new UberTransientUpstreamError({
        code: 'UBER_HTTP_503',
        message: 'Uber 暂时不可用',
        operation: 'menu.publish',
        upstreamStatus: 503,
      }),
      HttpStatus.SERVICE_UNAVAILABLE,
    ],
    [
      'rate limit',
      new UberRateLimitedError({
        code: 'UBER_HTTP_429',
        message: 'Uber 请求过于频繁',
        operation: 'order.fetch',
        upstreamStatus: 429,
      }),
      HttpStatus.TOO_MANY_REQUESTS,
    ],
    [
      'authentication',
      new UberAuthenticationError({
        code: 'UBER_ACCESS_TOKEN_INVALID',
        message: 'Uber 凭据无效',
        operation: 'store.discover',
        upstreamStatus: 401,
      }),
      HttpStatus.UNAUTHORIZED,
    ],
    [
      'local input',
      new UberValidationError({
        code: 'UBER_RESOURCE_HREF_INVALID',
        message: 'resource_href 无效',
        operation: 'order.resource_href.validate',
        upstreamStatus: null,
      }),
      HttpStatus.BAD_REQUEST,
    ],
  ])('does not collapse %s into HTTP 400', (_name, error, expected) => {
    expect(typeof error.code).toBe('string');
    expect(typeof error.operation).toBe('string');
    expect(typeof error.retryable).toBe('boolean');
    expect([null, 401, 429, 503]).toContain(error.upstreamStatus);
    expect(present(error)).toBe(expected);
  });

  it('presents only the safe public contract and retry metadata', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const setHeader = jest.fn();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status, setHeader }),
        getRequest: () => ({ headers: { 'x-correlation-id': 'request-1' } }),
      }),
    } as unknown as ArgumentsHost;
    const cause = new Error('Bearer credential upstream-body');
    cause.stack = 'sensitive stack';

    new UberEatsExceptionFilter().catch(
      new UberRateLimitedError({
        code: 'UBER_HTTP_429',
        message: 'Uber 请求过于频繁',
        operation: 'menu.publish',
        retryAfterMs: 2_100,
        cause,
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', 3);
    expect(json).toHaveBeenCalledWith({
      code: 'UBER_HTTP_429',
      message: 'Uber 请求过于频繁',
      retryable: true,
      correlationId: 'request-1',
    });
    expect(JSON.stringify(json.mock.calls)).not.toMatch(
      /credential|stack|operation|upstream-body/,
    );
  });
});
