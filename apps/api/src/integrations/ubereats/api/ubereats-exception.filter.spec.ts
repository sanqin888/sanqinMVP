import { HttpStatus } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { UberRateLimitedError } from '../application/errors/uber-application.error';
import { UberEatsExceptionFilter } from './ubereats-exception.filter';

describe('UberEatsExceptionFilter', () => {
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
