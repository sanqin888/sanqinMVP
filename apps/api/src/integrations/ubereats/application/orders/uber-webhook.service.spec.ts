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
import { UberConfigService } from '../../infrastructure/config/uber-config.service';
import { ProcessUberWebhookInboxUseCase } from './process-uber-webhook-inbox.use-case';
import { ReceiveUberWebhookUseCase } from './uber-webhook-receiver.use-case';
import { createReceiveUberWebhookUseCase } from '../../test/uber-service-test.helpers';

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

describe('Uber webhook use cases', () => {
  it('routes Uber ordering metadata to the order use case', async () => {
    const item = {
      eventId: 'evt-order-ordered',
      eventType: 'orders.ready_for_pickup',
      payload: {
        event_type: 'orders.ready_for_pickup',
        event_id: 'evt-order-ordered',
        resource_href: 'https://api.uber.com/v2/eats/order/order-1',
        resource_id: 'order-1',
        meta: { resource_id: 'store-1', user_id: 'user-1' },
        event_time: '2026-08-10T12:00:00.000Z',
        resource_version: '42',
        sequence_number: '7',
      },
      leaseToken: 'lease',
      idempotencyKey: 'key',
      businessVersion: 'v1',
    };
    const inboxPort = {
      claimDue: jest.fn().mockResolvedValue([item]),
      markSucceeded: jest.fn().mockResolvedValue(undefined),
      markUnsupported: jest.fn().mockResolvedValue(undefined),
      requeueUnsupported: jest.fn().mockResolvedValue(0),
      markFailed: jest.fn().mockResolvedValue(undefined),
      enqueue: jest.fn(),
      setStoreProvisioned: jest.fn(),
    };
    const orders = { execute: jest.fn().mockResolvedValue(undefined) };
    const worker = new ProcessUberWebhookInboxUseCase(
      inboxPort,
      orders as never,
      {} as never,
      { execute: jest.fn() } as never,
      { captureEvent: jest.fn(), workflowLog: jest.fn() },
    );

    await worker.execute();

    expect(orders.execute).toHaveBeenCalledWith(
      item.eventType,
      item.eventId,
      expect.objectContaining({ resourceId: 'order-1' }),
      {
        occurredAt: new Date('2026-08-10T12:00:00.000Z'),
        resourceVersion: '42',
        sequence: 7,
      },
    );
    expect(inboxPort.markSucceeded).toHaveBeenCalledWith(item);
  });

  it.each(['menus.deleted', 'store.mystery', 'completely.unknown'])(
    '隔离未知事件 %s，不会错误标记为成功',
    async (eventType) => {
      const item = {
        eventId: `evt-${eventType}`,
        eventType,
        payload: { secret: 'must-not-appear-in-alerts' },
        leaseToken: 'lease',
        idempotencyKey: 'stable-key',
        businessVersion: 'v1',
      };
      const inboxPort = {
        claimDue: jest.fn().mockResolvedValue([item]),
        markSucceeded: jest.fn(),
        markUnsupported: jest.fn().mockResolvedValue(undefined),
        requeueUnsupported: jest.fn().mockResolvedValue(0),
        markFailed: jest.fn(),
        enqueue: jest.fn(),
        setStoreProvisioned: jest.fn(),
      };
      const telemetry = {
        captureEvent: jest.fn().mockResolvedValue(undefined),
        workflowLog: jest.fn(),
      };
      const worker = new ProcessUberWebhookInboxUseCase(
        inboxPort,
        { execute: jest.fn() } as never,
        { handle: jest.fn() } as never,
        { execute: jest.fn() } as never,
        telemetry,
      );

      await worker.execute();

      expect(inboxPort.markSucceeded).not.toHaveBeenCalled();
      expect(inboxPort.markFailed).not.toHaveBeenCalled();
      expect(inboxPort.markUnsupported).toHaveBeenCalledWith(
        item,
        expect.objectContaining({
          code: 'UBER_WEBHOOK_EVENT_UNSUPPORTED',
          eventType,
          businessVersion: 'v1',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          safeSummary: expect.stringMatching(
            /^type=.*;payloadSha256=[a-f0-9]{16}$/,
          ),
        }),
      );
      expect(telemetry.captureEvent).toHaveBeenCalledWith(
        'ubereats_webhook_unsupported',
        expect.objectContaining({ priority: 'high', eventType }),
      );
      expect(JSON.stringify(telemetry.captureEvent.mock.calls)).not.toContain(
        'must-not-appear-in-alerts',
      );
    },
  );

  it('仍会完成已支持的 store 事件', async () => {
    const item = {
      eventId: 'evt-store',
      eventType: 'store.provisioned',
      payload: { resource_id: 'store-1' },
      leaseToken: 'lease',
      idempotencyKey: 'key',
      businessVersion: 'v1',
    };
    const inboxPort = {
      claimDue: jest.fn().mockResolvedValue([item]),
      markSucceeded: jest.fn().mockResolvedValue(undefined),
      markUnsupported: jest.fn(),
      requeueUnsupported: jest.fn().mockResolvedValue(0),
      markFailed: jest.fn(),
      enqueue: jest.fn(),
      setStoreProvisioned: jest.fn(),
    };
    const merchant = { execute: jest.fn().mockResolvedValue(undefined) };
    const worker = new ProcessUberWebhookInboxUseCase(
      inboxPort,
      {} as never,
      {} as never,
      merchant as never,
      { captureEvent: jest.fn(), workflowLog: jest.fn() },
    );

    await worker.execute();

    expect(merchant.execute).toHaveBeenCalledWith(
      item.eventType,
      item.eventId,
      item.payload,
    );
    expect(inboxPort.markSucceeded).toHaveBeenCalledWith(item);
    expect(inboxPort.markUnsupported).not.toHaveBeenCalled();
  });

  it('HTTP 阶段校验签名并持久化 inbox，但不执行业务用例', async () => {
    const uberWebhookInbox = inbox();
    const orders = {
      processWebhookEvent: jest.fn().mockResolvedValue(undefined),
    };
    const service = createReceiveUberWebhookUseCase(
      {
        uberWebhookInbox,
        opsEvent: { create: jest.fn() },
      } as unknown as ConstructorParameters<
        typeof ReceiveUberWebhookUseCase
      >[0],
      config(),
      orders as unknown as ConstructorParameters<
        typeof ReceiveUberWebhookUseCase
      >[2],
    );
    const body = {
      event_type: 'orders.notification',
      event_id: 'evt-order-1',
      resource_href: 'https://api.uber.com/v2/eats/order/order-1',
      resource_id: 'order-1',
      meta: { resource_id: 'store-1', user_id: 'user-1' },
    };

    await service.execute(signed(body));

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
    const service = createReceiveUberWebhookUseCase(
      { uberWebhookInbox } as unknown as ConstructorParameters<
        typeof ReceiveUberWebhookUseCase
      >[0],
      config(),
      undefined,
      menu as unknown as ConstructorParameters<
        typeof ReceiveUberWebhookUseCase
      >[3],
    );
    const body = {
      event_type: 'menus.notification',
      event_id: 'evt-menu-1',
      resource_href: 'https://api.uber.com/v2/eats/stores/store-1/menu',
      meta: { resource_id: 'store-1', user_id: 'user-1' },
    };

    await service.execute(signed(body));

    expect(menu.processWebhookEvent).not.toHaveBeenCalled();
  });

  it('拒绝无效签名且不会 claim inbox', async () => {
    const uberWebhookInbox = inbox();
    const service = createReceiveUberWebhookUseCase(
      { uberWebhookInbox } as unknown as ConstructorParameters<
        typeof ReceiveUberWebhookUseCase
      >[0],
      config(),
    );

    await expect(
      service.execute({
        rawBody: '{}',
        headers: { 'x-uber-signature': '0'.repeat(64) },
      }),
    ).rejects.toThrow('Uber webhook signature is invalid');
    expect(uberWebhookInbox.create).not.toHaveBeenCalled();
  });

  it('只公开 webhook 领域入口，不暴露订单、菜单或运营 API', () => {
    const service = createReceiveUberWebhookUseCase(
      { uberWebhookInbox: inbox() } as unknown as ConstructorParameters<
        typeof ReceiveUberWebhookUseCase
      >[0],
      config(),
    ) as unknown as Record<string, unknown>;

    expect(typeof service.execute).toBe('function');
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

describe('ReceiveUberWebhookUseCase 最小依赖装配', () => {
  it('构造函数只声明工作流依赖与统一 telemetry service', () => {
    expect(ReceiveUberWebhookUseCase.length).toBe(3);
  });
  it('只要求 webhook 签名密钥，不要求 OAuth state 密钥', () => {
    const webhookOnly = new UberConfigService({
      UBER_EATS_WEBHOOK_SIGNING_KEY: signingKey,
    });
    expect(() =>
      createReceiveUberWebhookUseCase({} as never, webhookOnly),
    ).not.toThrow();
    expect(() =>
      createReceiveUberWebhookUseCase({} as never, new UberConfigService()),
    ).toThrow('UBER_EATS_WEBHOOK_SIGNING_KEY');
  });
});
