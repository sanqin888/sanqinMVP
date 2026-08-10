import { UberApiError, UberHttpClient } from './uber-http.client';
import { AppLogger } from '../../../../common/app-logger';

describe('UberHttpClient structured error mapping', () => {
  beforeEach(() => {
    process.env.UBER_EATS_HTTP_MAX_ATTEMPTS = '1';
  });

  afterEach(() => {
    delete process.env.UBER_EATS_HTTP_MAX_ATTEMPTS;
    jest.restoreAllMocks();
  });

  it.each([
    [400, 'UBER_INVALID_REQUEST', 'validation', false],
    [401, 'UBER_ACCESS_TOKEN_INVALID', 'authentication', false],
    [403, 'UBER_SCOPE_INSUFFICIENT', 'authentication', false],
    [404, 'UBER_HTTP_404', 'validation', false],
    [408, 'UBER_HTTP_408', 'transient-upstream', true],
    [429, 'UBER_HTTP_429', 'rate-limited', true],
    [500, 'UBER_HTTP_500', 'transient-upstream', true],
    [503, 'UBER_HTTP_503', 'transient-upstream', true],
  ] as const)(
    'maps HTTP %i to a stable structured error',
    async (status, code, category, retryable) => {
      const errorSpy = jest
        .spyOn(AppLogger.prototype, 'error')
        .mockImplementation();
      jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          status === 400
            ? JSON.stringify({ code: 'invalid_request', message: 'bad input' })
            : JSON.stringify({ message: `HTTP ${status}` }),
          {
            status,
            headers: status === 429 ? { 'Retry-After': '2' } : undefined,
          },
        ),
      );

      const error = await new UberHttpClient()
        .request({
          url: 'https://api.uber.com/orders?access_token=secret',
          operation: 'order.get',
        })
        .catch((value: unknown) => value);

      expect(error).toBeInstanceOf(UberApiError);
      expect(error).toMatchObject({
        httpStatus: status,
        uberCode: code,
        category,
        retryable,
        operation: 'order.get',
      });
      expect(error).not.toHaveProperty('getStatus');
      if (status === 429) expect(error).toMatchObject({ retryAfterMs: 2_000 });
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`code=${code} retryable=${retryable}`),
      );
    },
  );

  it('redacts credentials from safeDetail', async () => {
    const errorSpy = jest
      .spyOn(AppLogger.prototype, 'error')
      .mockImplementation();
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ message: 'authorization=abc token=def secret=ghi' }),
        {
          status: 400,
        },
      ),
    );
    const error = await new UberHttpClient()
      .request({ url: 'https://api.uber.com/orders', operation: 'order.get' })
      .catch((value: unknown) => value as UberApiError);
    expect(error.safeDetail).not.toMatch(/abc|def|ghi/);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('code=UBER_HTTP_400 retryable=false'),
    );
  });
});
