import { UberApiError, UberHttpClient } from './uber-http.client';

describe('UberHttpClient structured error mapping', () => {
  beforeEach(() => {
    process.env.UBER_EATS_HTTP_MAX_ATTEMPTS = '1';
  });

  afterEach(() => {
    delete process.env.UBER_EATS_HTTP_MAX_ATTEMPTS;
    jest.restoreAllMocks();
  });

  it.each([
    [400, 'UBER_INVALID_REQUEST', 'business', false, 400],
    [401, 'UBER_ACCESS_TOKEN_INVALID', 'authentication', false, 401],
    [403, 'UBER_SCOPE_INSUFFICIENT', 'permission', false, 403],
    [404, 'UBER_HTTP_404', 'business', false, 400],
    [408, 'UBER_HTTP_408', 'upstream', true, 503],
    [429, 'UBER_HTTP_429', 'upstream', true, 503],
    [500, 'UBER_HTTP_500', 'upstream', true, 503],
    [503, 'UBER_HTTP_503', 'upstream', true, 503],
  ] as const)(
    'maps HTTP %i to a stable structured error',
    async (status, code, category, retryable, exposedStatus) => {
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
      expect((error as UberApiError).getStatus()).toBe(exposedStatus);
      if (status === 429) expect(error).toMatchObject({ retryAfterMs: 2_000 });
    },
  );

  it('redacts credentials from safeDetail', async () => {
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
  });
});
