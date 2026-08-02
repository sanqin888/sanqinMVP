import { UberAuthService } from './uber-auth.service';

describe('UberAuthService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('buildMerchantAuthorizeUrl 会生成包含 state 与 scope 的授权链接', () => {
    process.env.UBER_EATS_CLIENT_ID = 'app_1';
    process.env.UBER_EATS_CLIENT_SECRET = 'secret_1';
    process.env.UBER_EATS_REDIRECT_URI =
      'https://example.com/api/integrations/ubereats/oauth/callback';

    const service = new UberAuthService();
    const url = service.buildMerchantAuthorizeUrl('state_123');

    expect(url).toContain('client_id=app_1');
    expect(url).toContain('response_type=code');
    expect(url).toContain('state=state_123');
    expect(url).toContain('scope=eats.pos_provisioning');
  });

  it('getAccessToken 会命中缓存，未过期时不重复请求', async () => {
    const service = new UberAuthService();
    const now = Date.now();
    const scope = 'eats.store eats.order';

    Reflect.set(
      service,
      'tokenCache',
      new Map([
        [
          scope,
          {
            accessToken: 'token_cached',
            expiresAt: now + 10 * 60 * 1000,
          },
        ],
      ]),
    );

    await expect(service.getAccessToken(scope)).resolves.toBe('token_cached');
  });

  it('token 过期时会刷新并缓存', async () => {
    const service = new UberAuthService();
    const requestAccessTokenSpy = jest
      .spyOn(service as never, 'requestAccessToken' as never)
      .mockResolvedValue({
        accessToken: 'token_new',
        expiresAt: Date.now() + 3600000,
      });

    await expect(service.getAccessToken()).resolves.toBe('token_new');
    await expect(service.getAccessToken()).resolves.toBe('token_new');
    expect(requestAccessTokenSpy).toHaveBeenCalledTimes(1);
  });

  it('token endpoint 失败时只输出白名单错误字段并脱敏凭据', async () => {
    process.env.UBER_EATS_CLIENT_ID = 'app_1';
    process.env.UBER_EATS_CLIENT_SECRET = 'top-secret';
    const errorSpy = jest.fn();
    const service = new UberAuthService();
    Reflect.set(service, 'logger', { error: errorSpy, debug: jest.fn() });
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          error: 'invalid_client',
          error_description: 'client_secret=leaked credential rejected',
          access_token: 'must-not-appear',
        }),
      ),
    });

    await expect(service.getAccessToken('eats.store')).rejects.toThrow(
      'status=401 uberErrorCode=invalid_client',
    );
    const logged = errorSpy.mock.calls.flat().join(' ');
    expect(logged).toContain('description=[redacted] credential rejected');
    expect(logged).not.toContain('leaked');
    expect(logged).not.toContain('must-not-appear');
  });
});
