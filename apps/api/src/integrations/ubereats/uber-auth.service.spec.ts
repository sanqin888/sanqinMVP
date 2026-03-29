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
    const normalizedScope = 'eats.order eats.store';

    Reflect.set(
      service,
      'tokenCache',
      new Map([
        [
          normalizedScope,
          {
            accessToken: 'token_cached',
            expiresAt: now + 10 * 60 * 1000,
          },
        ],
      ]),
    );

    await expect(service.getAccessToken()).resolves.toBe('token_cached');
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
});
