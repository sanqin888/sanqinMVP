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

  it('为三类 durable worker 读取独立调度配置', () => {
    const config = create({
      UBER_EATS_WORKER_ENABLED: 'true',
      UBER_EATS_WORKER_POLL_INTERVAL_MS: '250',
      UBER_EATS_WORKER_BATCH_SIZE: '20',
      UBER_EATS_WORKER_LEASE_DURATION_MS: '5000',
      UBER_EATS_WORKER_SHUTDOWN_TIMEOUT_MS: '1000',
      UBER_EATS_WEBHOOK_INBOX_WORKER_CONCURRENCY: '4',
      UBER_EATS_ORDER_ACTION_WORKER_INITIAL_BACKOFF_MS: '200',
      UBER_EATS_MENU_CONFIRMATION_WORKER_MAX_BACKOFF_MS: '90000',
    });

    expect(config.workerEnabled).toBe(true);
    expect(config.workerPollIntervalMs).toBe(250);
    expect(config.workerBatchSize).toBe(20);
    expect(config.workerLeaseDurationMs).toBe(5000);
    expect(config.workerShutdownTimeoutMs).toBe(1000);
    expect(config.workerPolicies.webhookInbox.concurrency).toBe(4);
    expect(config.workerPolicies.orderAction.initialBackoffMs).toBe(200);
    expect(config.workerPolicies.menuConfirmation.maxBackoffMs).toBe(90000);
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

  it('只在读取 OAuth state 能力时校验密钥强度，且错误不泄露内容', () => {
    const secret = 'weak-secret';
    const config = create({ UBER_EATS_OAUTH_STATE_SECRET: secret });
    expect(() => config.getOAuthStateSecret()).toThrow(
      'UBER_EATS_OAUTH_STATE_SECRET',
    );
    try {
      config.getOAuthStateSecret();
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it('缺少敏感配置时普通配置仍可创建，各能力在自己的边界快速失败', () => {
    const config = create();

    expect(config.apiBaseUrl).toBe('');
    expect(() => config.getOAuthStateSecret()).toThrow(
      'UBER_EATS_OAUTH_STATE_SECRET',
    );
    expect(() => config.getWebhookSigningKey()).toThrow(
      'UBER_EATS_WEBHOOK_SIGNING_KEY',
    );
  });
});
