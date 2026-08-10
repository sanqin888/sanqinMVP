jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  Channel: { ubereats: 'ubereats' },
  FulfillmentType: { pickup: 'pickup', delivery: 'delivery' },
  OrderStatus: { pending: 'pending', paid: 'paid' },
  UberMenuPublishStatus: {
    SUBMITTED: 'SUBMITTED',
    SUCCEEDED: 'SUCCEEDED',
    FAILED: 'FAILED',
  },
  UberOpsTicketPriority: { HIGH: 'HIGH' },
  UberOpsTicketStatus: { OPEN: 'OPEN' },
  UberOpsTicketType: { STORE_STATUS_SYNC: 'STORE_STATUS_SYNC' },
  PaymentMethod: { UBEREATS: 'UBEREATS' },
}));

import { createHmac } from 'crypto';
import { UberConfigService } from './uber-config.service';
import { UberWebhookService } from './uber-webhook.service';
import { createUberWebhookService } from './uber-service-test.helpers';

const signingKey = 'uber-webhook-signing-key';
const config = () =>
  new UberConfigService({
    UBER_EATS_OAUTH_STATE_SECRET: '0123456789abcdef0123456789ABCDEF',
    UBER_EATS_WEBHOOK_SIGNING_KEY: signingKey,
  });
const inbox = () => ({
  create: jest.fn().mockResolvedValue({ id: 'inbox-1' }),
  updateMany: jest.fn().mockResolvedValue({ count: 1 }),
});
const signed = (body: unknown) => {
  const rawBody = JSON.stringify(body);
  return {
    rawBody,
    headers: {
      'x-uber-signature': createHmac('sha256', signingKey)
        .update(rawBody)
        .digest('hex'),
    },
  };
};

describe('UberWebhookService', () => {
  it('HTTP 阶段校验签名并持久化 inbox，但不执行业务用例', async () => {
    const uberWebhookInbox = inbox();
    const orders = {
      processWebhookEvent: jest.fn().mockResolvedValue(undefined),
    };
    const service = createUberWebhookService(
      {
        uberWebhookInbox,
        opsEvent: { create: jest.fn() },
      } as unknown as ConstructorParameters<typeof UberWebhookService>[0],
      config(),
      orders as unknown as ConstructorParameters<typeof UberWebhookService>[2],
    );
    const body = {
      event_type: 'orders.notification',
      event_id: 'evt-order-1',
      resource_href: 'https://api.uber.com/v2/eats/order/order-1',
      resource_id: 'order-1',
    };

    await service.handleWebhook(signed(body));

    expect(orders.processWebhookEvent).not.toHaveBeenCalled();
    expect(uberWebhookInbox.create).toHaveBeenCalledTimes(1);
    expect(uberWebhookInbox.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING' }) as unknown,
      }),
    );
  });

  it('HTTP 阶段不会同步路由菜单通知', async () => {
    const uberWebhookInbox = inbox();
    const menu = {
      processWebhookEvent: jest.fn().mockResolvedValue(undefined),
    };
    const service = createUberWebhookService(
      { uberWebhookInbox } as unknown as ConstructorParameters<
        typeof UberWebhookService
      >[0],
      config(),
      undefined,
      menu as unknown as ConstructorParameters<typeof UberWebhookService>[3],
    );
    const body = { event_type: 'menus.notification', event_id: 'evt-menu-1' };

    await service.handleWebhook(signed(body));

    expect(menu.processWebhookEvent).not.toHaveBeenCalled();
  });

  it('拒绝无效签名且不会 claim inbox', async () => {
    const uberWebhookInbox = inbox();
    const service = createUberWebhookService(
      { uberWebhookInbox } as unknown as ConstructorParameters<
        typeof UberWebhookService
      >[0],
      config(),
    );

    await expect(
      service.handleWebhook({
        rawBody: '{}',
        headers: { 'x-uber-signature': '0'.repeat(64) },
      }),
    ).rejects.toThrow('Invalid Uber signature');
    expect(uberWebhookInbox.create).not.toHaveBeenCalled();
  });

  it('只公开 webhook 领域入口，不暴露订单、菜单或运营 API', () => {
    const service = createUberWebhookService(
      { uberWebhookInbox: inbox() } as unknown as ConstructorParameters<
        typeof UberWebhookService
      >[0],
      config(),
    ) as unknown as Record<string, unknown>;

    expect(typeof service.handleWebhook).toBe('function');
    for (const unrelated of [
      'acceptUberOrder',
      'publishUberMenu',
      'buildMerchantAuthorizeUrl',
      'generateReconciliationReport',
    ]) {
      expect(service[unrelated]).toBeUndefined();
    }
  });
});

describe('UberWebhookService 最小依赖装配', () => {
  it('构造函数只声明 Prisma、webhook 配置、订单与菜单服务', () => {
    expect(UberWebhookService.length).toBe(5);
  });
  it('只要求 webhook 签名密钥，不要求 OAuth state 密钥', () => {
    const webhookOnly = new UberConfigService({
      UBER_EATS_WEBHOOK_SIGNING_KEY: signingKey,
    });
    expect(() =>
      createUberWebhookService({} as never, webhookOnly),
    ).not.toThrow();
    expect(() =>
      createUberWebhookService({} as never, new UberConfigService()),
    ).toThrow('UBER_EATS_WEBHOOK_SIGNING_KEY');
  });
});
