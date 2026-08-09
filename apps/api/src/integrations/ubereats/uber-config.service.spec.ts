import { Test } from '@nestjs/testing';
import { UberConfigService, UberEnvironment } from './uber-config.service';

describe('UberConfigService', () => {
  const create = (overrides: UberEnvironment = {}) =>
    new UberConfigService(overrides);

  it('通过工厂 Provider 在 Nest 测试模块中完成实例化', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: UberConfigService,
          useFactory: () => new UberConfigService(process.env),
        },
      ],
    }).compile();

    expect(moduleRef.get(UberConfigService)).toBeInstanceOf(UberConfigService);
    await moduleRef.close();
  });

  it('使用菜单轮询默认值', () => {
    const config = create();

    expect(config.menuConfirmTimeoutMs).toBe(120_000);
    expect(config.menuConfirmInitialDelayMs).toBe(1_000);
    expect(config.menuConfirmMaxDelayMs).toBe(30_000);
  });

  it.each(['', 'abc', 'NaN', 'Infinity', '-Infinity', '1.5'])(
    '拒绝非有限整数 timeout=%p，并只在错误中显示键名',
    (value) => {
      expect(() =>
        create({ UBER_EATS_MENU_CONFIRM_TIMEOUT_MS: value }),
      ).toThrow('UBER_EATS_MENU_CONFIRM_TIMEOUT_MS');
      try {
        create({ UBER_EATS_MENU_CONFIRM_TIMEOUT_MS: value });
      } catch (error) {
        expect((error as Error).message).not.toContain(`=${value}`);
      }
    },
  );

  it.each(['-1', '99', '600001'])(
    '拒绝负数或超出 timeout 上下限的值 %p',
    (value) => {
      expect(() =>
        create({ UBER_EATS_MENU_CONFIRM_TIMEOUT_MS: value }),
      ).toThrow('UBER_EATS_MENU_CONFIRM_TIMEOUT_MS');
    },
  );

  it('拒绝大于总超时的初始延迟', () => {
    expect(() =>
      create({
        UBER_EATS_MENU_CONFIRM_TIMEOUT_MS: '100',
        UBER_EATS_MENU_CONFIRM_INITIAL_DELAY_MS: '101',
      }),
    ).toThrow('UBER_EATS_MENU_CONFIRM_INITIAL_DELAY_MS');
  });

  it('将指数退避最大延迟限制在总超时内', () => {
    const config = create({
      UBER_EATS_MENU_CONFIRM_TIMEOUT_MS: '100',
      UBER_EATS_MENU_CONFIRM_INITIAL_DELAY_MS: '10',
      UBER_EATS_MENU_CONFIRM_MAX_DELAY_MS: '1000',
    });

    expect(config.menuConfirmMaxDelayMs).toBe(100);
  });

  it.each([
    ['UBER_EATS_API_BASE_URL', 'not-a-url'],
    ['UBER_EATS_REDIRECT_URI', 'ftp://example.com/callback'],
    ['UBER_EATS_RESOURCE_HREF_ALLOWED_ORIGINS', 'https://example.com/path'],
  ])('拒绝非法 URL 配置 %s', (key, value) => {
    expect(() => create({ [key]: value })).toThrow(key);
  });

  it('OAuth state 密钥错误不泄露密钥内容', () => {
    const secret = 'weak-secret';
    expect(() => create({ UBER_EATS_OAUTH_STATE_SECRET: secret })).toThrow(
      'UBER_EATS_OAUTH_STATE_SECRET',
    );
    try {
      create({ UBER_EATS_OAUTH_STATE_SECRET: secret });
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }
  });
});
