import { mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { UberAuthService } from './uber-auth.service';

describe('UberAuthService', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  const validPrivateKey =
    '-----BEGIN PRIVATE KEY-----\\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBK...\\n-----END PRIVATE KEY-----';

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('onModuleInit 会校验 key 文件并加载配置', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'uber-key-'));
    const file = join(dir, 'key.json');
    await writeFile(
      file,
      JSON.stringify({
        application_id: 'app_1',
        key_id: 'kid_1',
        private_key: validPrivateKey,
      }),
      'utf8',
    );

    process.env.UBER_EATS_KEY_FILE = file;

    const service = new UberAuthService();
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });

  it('key 文件缺少字段会直接报错', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'uber-key-'));
    const file = join(dir, 'key.json');
    await writeFile(
      file,
      JSON.stringify({
        application_id: 'app_1',
        key_id: 'kid_1',
      }),
      'utf8',
    );

    process.env.UBER_EATS_KEY_FILE = file;

    const service = new UberAuthService();
    await expect(service.onModuleInit()).rejects.toThrow(
      'Uber key 文件缺少 private_key',
    );
  });

  it('getAccessToken 会命中缓存，未过期时不重复请求', async () => {
    const service = new UberAuthService();
    const now = Date.now();

    Reflect.set(service, 'cachedAccessToken', 'token_cached');
    Reflect.set(service, 'accessTokenExpiresAt', now + 10 * 60 * 1000);

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
