import { CloverProviderConfig } from '../clover-provider.config';
import { CloverOAuthClient } from './clover-oauth.client';

const requestUrlText = (value: string | URL | Request): string => {
  if (typeof value === 'string') return value;
  if (value instanceof URL) return value.toString();
  return value.url;
};

const withEnvironment = (
  values: Record<string, string | undefined>,
  run: () => Promise<void> | void,
) => {
  const original = new Map(
    Object.keys(values).map((key) => [key, process.env[key]] as const),
  );
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const restore = () => {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  try {
    const result = run();
    if (result instanceof Promise) return result.finally(restore);
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
};

describe('CloverOAuthClient', () => {
  afterEach(() => jest.restoreAllMocks());

  it('builds the current NA Production OAuth v2 authorize URL with a fixed callback', () =>
    withEnvironment(
      {
        CLOVER_OAUTH_CLIENT_ID: 'app-123',
        CLOVER_OAUTH_CLIENT_SECRET: 'server-secret',
        CLOVER_OAUTH_CALLBACK_URL: 'https://sanq.ca/clover/oauth/callback',
        CLOVER_OAUTH_AUTHORIZE_BASE: 'https://www.clover.com',
      },
      () => {
        const client = new CloverOAuthClient(new CloverProviderConfig());
        const url = new URL(client.buildAuthorizeUrl('state-value'));

        expect(url.origin + url.pathname).toBe(
          'https://www.clover.com/oauth/v2/authorize',
        );
        expect(url.searchParams.get('client_id')).toBe('app-123');
        expect(url.searchParams.get('response_type')).toBe('code');
        expect(url.searchParams.get('redirect_uri')).toBe(
          'https://sanq.ca/clover/oauth/callback',
        );
        expect(url.searchParams.get('state')).toBe('state-value');
        expect(url.searchParams.has('redirect')).toBe(false);
      },
    ));

  it('exchanges a code with JSON at the v2 token endpoint without putting secrets in the URL', async () =>
    withEnvironment(
      {
        CLOVER_OAUTH_CLIENT_ID: 'app-123',
        CLOVER_OAUTH_CLIENT_SECRET: 'server-secret',
        CLOVER_OAUTH_CALLBACK_URL: 'https://sanq.ca/clover/oauth/callback',
        CLOVER_OAUTH_API_BASE: 'https://api.clover.com',
      },
      async () => {
        const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
          new Response(
            JSON.stringify({
              access_token: 'access-token',
              refresh_token: 'refresh-token',
              access_token_expiration: 2_000_000_000,
              refresh_token_expiration: 2_100_000_000,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
        const client = new CloverOAuthClient(new CloverProviderConfig());

        const tokens = await client.exchangeAuthorizationCode('auth-code');

        expect(tokens.accessToken).toBe('access-token');
        expect(tokens.refreshToken).toBe('refresh-token');
        const [url, init] = fetchSpy.mock.calls[0];
        const urlText = requestUrlText(url);
        const bodyText = typeof init?.body === 'string' ? init.body : '';
        expect(urlText).toBe('https://api.clover.com/oauth/v2/token');
        expect(urlText).not.toContain('server-secret');
        expect(JSON.parse(bodyText)).toEqual({
          client_id: 'app-123',
          client_secret: 'server-secret',
          code: 'auth-code',
        });
        expect(new Headers(init?.headers).get('Content-Type')).toBe(
          'application/json',
        );
      },
    ));

  it('uses Clover refresh-token recovery after a recoverable 401', async () =>
    withEnvironment(
      {
        CLOVER_OAUTH_CLIENT_ID: 'app-123',
        CLOVER_OAUTH_CLIENT_SECRET: 'server-secret',
        CLOVER_OAUTH_CALLBACK_URL: 'https://sanq.ca/clover/oauth/callback',
        CLOVER_OAUTH_API_BASE: 'https://api.clover.com',
      },
      async () => {
        const fetchSpy = jest
          .spyOn(global, 'fetch')
          .mockResolvedValueOnce(
            new Response('{}', {
              status: 401,
              headers: { 'X-Clover-Recovery-Available': 'true' },
            }),
          )
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify({
                access_token: 'recovered-access',
                refresh_token: 'recovered-refresh',
                access_token_expiration: 2_000_000_000,
              }),
              { status: 200 },
            ),
          );
        const client = new CloverOAuthClient(new CloverProviderConfig());

        const tokens = await client.refreshTokens('previous-refresh-token');

        expect(tokens.refreshToken).toBe('recovered-refresh');
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(fetchSpy.mock.calls[0][0]).toBe(
          'https://api.clover.com/oauth/v2/refresh',
        );
        expect(fetchSpy.mock.calls[1][0]).toBe(
          'https://api.clover.com/oauth/v2/recovery',
        );
        const recoveryBody = fetchSpy.mock.calls[1][1]?.body;
        expect(
          JSON.parse(typeof recoveryBody === 'string' ? recoveryBody : ''),
        ).toEqual({
          client_id: 'app-123',
          client_secret: 'server-secret',
          recovery_token: 'previous-refresh-token',
        });
      },
    ));
});
