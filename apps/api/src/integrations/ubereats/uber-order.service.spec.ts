jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  Channel: { ubereats: 'ubereats' },
  FulfillmentType: { pickup: 'pickup', delivery: 'delivery' },
  OrderStatus: {
    pending: 'pending',
    paid: 'paid',
    making: 'making',
    ready: 'ready',
    completed: 'completed',
    cancelled: 'cancelled',
    refunded: 'refunded',
  },
  UberMenuPublishStatus: {
    SUBMITTED: 'SUBMITTED',
    SUCCEEDED: 'SUCCEEDED',
    FAILED: 'FAILED',
  },
  UberOpsTicketPriority: {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    CRITICAL: 'CRITICAL',
  },
  UberOpsTicketStatus: {
    OPEN: 'OPEN',
    IN_PROGRESS: 'IN_PROGRESS',
    RESOLVED: 'RESOLVED',
  },
  UberOpsTicketType: { STORE_STATUS_SYNC: 'STORE_STATUS_SYNC' },
  PaymentMethod: { UBEREATS: 'UBEREATS' },
}));

import { createHmac } from 'crypto';
import { AppLogger } from '../../common/app-logger';
import { UberOrderService } from './uber-order.service';

describe('UberOrderService', () => {
  it('为嵌套 Uber modifier 快照补齐本地中英文名称并保留外部标题回退', async () => {
    const service = new UberOrderService(
      createSignatureOnlyPrisma() as unknown as ConstructorParameters<
        typeof UberOrderService
      >[0],
      createAuthService(),
    );
    const tx = {
      menuOptionGroupTemplate: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { stableId: 'group-spice', nameEn: 'Spice', nameZh: '辣度' },
          ]),
      },
      menuOptionTemplateChoice: {
        findMany: jest.fn().mockResolvedValue([
          { stableId: 'mild', nameEn: 'Mild', nameZh: '微辣' },
          { stableId: 'extra', nameEn: 'Extra topping', nameZh: null },
        ]),
      },
      uberModifierGroupConfig: { findFirst: jest.fn().mockResolvedValue(null) },
      uberOptionItemConfig: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const snapshot = await (
      service as unknown as {
        toOrderOptionsSnapshot(
          tx: unknown,
          storeId: string,
          items: unknown[],
        ): Promise<unknown[]>;
      }
    ).toOrderOptionsSnapshot(tx, 'store-1', [
      {
        externalId: 'mild',
        parentExternalId: 'group-spice',
        displayName: 'Uber Mild',
        quantity: 1,
        priceDeltaCents: 0,
        specialInstructions: null,
        children: [
          {
            externalId: 'extra',
            parentExternalId: 'child-group-unmapped',
            displayName: 'Uber Extra',
            quantity: 1,
            priceDeltaCents: 100,
            specialInstructions: null,
            children: [],
          },
        ],
      },
    ]);

    expect(snapshot[0]).toMatchObject({
      nameEn: 'Spice',
      nameZh: '辣度',
      choices: [
        { nameEn: 'Mild', nameZh: '微辣', displayName: 'Uber Mild' },
        { nameEn: 'Extra topping', nameZh: null, displayName: 'Uber Extra' },
      ],
    });
  });
  const clientSecret = 'test-ubereats-secret';
  const createInboxMock = () => ({
    create: jest.fn().mockResolvedValue({ id: 'inbox_1' }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    upsert: jest.fn().mockResolvedValue({ id: 'inbox_1' }),
  });
  const createAuthService = () =>
    ({
      getAccessToken: jest.fn().mockResolvedValue('token_debug_1234567890'),
      forceRefreshAccessToken: jest
        .fn()
        .mockResolvedValue('token_debug_1234567890'),
      normalizeScopesToArray: jest.fn().mockImplementation((scope?: string) => {
        if (!scope?.trim()) {
          return ['eats.store.orders.read'];
        }

        return scope.trim().split(/\s+/).filter(Boolean);
      }),
      buildMerchantAuthorizeUrl: jest
        .fn()
        .mockResolvedValue(
          'https://auth.uber.com/oauth/v2/authorize?state=test',
        ),
      getMerchantRedirectUri: jest
        .fn()
        .mockReturnValue('https://example.com/oauth/callback'),
      exchangeAuthorizationCode: jest.fn().mockResolvedValue({
        accessToken: 'merchant_token_123',
        refreshToken: 'refresh_token_123',
        expiresAt: new Date('2026-03-19T01:00:00Z'),
        scope: 'eats.pos_provisioning',
        tokenType: 'Bearer',
      }),
      getMerchantIdentity: jest.fn().mockResolvedValue({ id: 'merchant_1' }),
    }) as unknown as ConstructorParameters<typeof UberOrderService>[1];

  beforeEach(() => {
    process.env.UBER_EATS_CLIENT_SECRET = clientSecret;
    process.env.UBER_EATS_API_BASE_URL = 'https://api.uber.com';
    process.env.UBER_EATS_RESOURCE_HREF_ALLOWED_ORIGINS =
      'https://api.uber.com';
    process.env.UBER_EATS_WEBHOOK_SIGNING_KEY = clientSecret;
    process.env.UBER_EATS_OAUTH_STATE_SECRET =
      'high-entropy-test-secret-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.UBER_EATS_CLIENT_SECRET;
    delete process.env.UBER_EATS_WEBHOOK_SIGNING_KEY;
    delete process.env.UBER_EATS_API_BASE_URL;
    delete process.env.UBER_EATS_RESOURCE_HREF_ALLOWED_ORIGINS;
    delete process.env.UBER_EATS_OAUTH_STATE_SECRET;
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.WEB_BASE_URL;
    jest.restoreAllMocks();
  });

  const createSignatureOnlyPrisma = () => ({
    uberWebhookInbox: {
      create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    opsEvent: {
      create: jest.fn().mockResolvedValue(null),
    },
  });

  it('标准资源引用通知会下载完整订单后写入 ubereats 订单', async () => {
    const body = {
      event_type: 'orders.notification',
      resource_href: 'https://api.uber.com/v2/eats/order/ue_123',
      meta: { resource_id: 'ue_123', user_id: 'user_1' },
      event_id: 'evt_123',
    };
    const rawBody = JSON.stringify(body);
    const signature = createHmac('sha256', clientSecret)
      .update(rawBody, 'utf8')
      .digest('hex');

    type SavedUberOrder = {
      id: string;
      orderStableId: string;
      status: string;
      clientRequestId: string;
      channel: string;
      items: Array<Record<string, unknown>>;
      paidAt?: Date;
      makingAt?: Date;
    };
    type OrderFindUniqueArgs = { where: { clientRequestId?: string } };
    type OrderCreateArgs = {
      data: { status: string; clientRequestId: string; channel: string };
    };
    type OrderUpdateManyArgs = {
      where: { id: string; status: string | { in: string[] } };
      data: Partial<SavedUberOrder>;
    };
    type OrderFindManyArgs = {
      where?: {
        status?: { in?: string[] };
        channel?: { in?: string[] };
      };
    };
    type OrderItemCreateArgs = { data: Record<string, unknown> };

    let savedOrder: SavedUberOrder | null = null;
    const prisma = {
      order: {
        findUnique: jest
          .fn()
          .mockImplementation(({ where }: OrderFindUniqueArgs) => {
            if (where.clientRequestId === 'ubereats:ue_123') {
              return Promise.resolve(savedOrder);
            }
            return Promise.resolve(null);
          }),
        create: jest.fn().mockImplementation(({ data }: OrderCreateArgs) => {
          savedOrder = {
            id: 'order-db-id',
            orderStableId: 'ord_uber_1',
            status: data.status,
            clientRequestId: data.clientRequestId,
            channel: data.channel,
            items: [],
          };
          return Promise.resolve(savedOrder);
        }),
        updateMany: jest
          .fn()
          .mockImplementation(({ where, data }: OrderUpdateManyArgs) => {
            const expectedStatuses =
              typeof where.status === 'string'
                ? [where.status]
                : where.status.in;
            if (
              savedOrder &&
              savedOrder.id === where.id &&
              expectedStatuses.includes(savedOrder.status)
            ) {
              savedOrder = { ...savedOrder, ...data };
              return Promise.resolve({ count: 1 });
            }
            return Promise.resolve({ count: 0 });
          }),
        findMany: jest
          .fn()
          .mockImplementation(({ where }: OrderFindManyArgs) => {
            const statusIn = where?.status?.in ?? [];
            const channelIn = where?.channel?.in ?? [];
            return Promise.resolve(
              savedOrder &&
                statusIn.includes(savedOrder.status) &&
                channelIn.includes(savedOrder.channel) &&
                savedOrder.items.length > 0
                ? [savedOrder]
                : [],
            );
          }),
      },
      orderItem: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest
          .fn()
          .mockImplementation(({ data }: OrderItemCreateArgs) => {
            savedOrder?.items.push(data);
            return Promise.resolve({ id: 'item-db-id', ...data });
          }),
      },
      menuItem: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ stableId: 'menu_item_uber_1' }),
      },
      uberItemChannelConfig: { findFirst: jest.fn() },
      uberPublishedMenuItem: {
        findFirst: jest.fn().mockResolvedValue({
          menuItemStableId: 'menu_item_uber_1',
          publishedPriceCents: 800,
        }),
      },
      uberOrderItemModifier: { createMany: jest.fn() },
      uberWebhookInbox: createInboxMock(),
      businessConfig: {
        findUnique: jest.fn().mockResolvedValue({ isTemporarilyClosed: false }),
      },
      uberOrderAction: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'action_1',
          externalOrderId: 'ue_123',
          action: 'ACCEPT',
          status: 'PENDING',
          retryable: false,
          uberHttpStatus: null,
        }),
        upsert: jest.fn().mockResolvedValue({
          id: 'action_1',
          externalOrderId: 'ue_123',
          action: 'ACCEPT',
          status: 'PENDING',
          retryable: false,
          uberHttpStatus: null,
        }),
        create: jest.fn().mockResolvedValue({
          id: 'action_1',
          status: 'PENDING',
          retryable: false,
          uberHttpStatus: null,
        }),
        update: jest.fn().mockResolvedValue({
          id: 'action_1',
          externalOrderId: 'ue_123',
          action: 'ACCEPT',
          status: 'SUCCEEDED',
          retryable: false,
          uberHttpStatus: 200,
        }),
      },
      opsEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(null),
      },
    };
    Object.assign(prisma, {
      $transaction: jest.fn(
        (callback: (transaction: typeof prisma) => unknown) => callback(prisma),
      ),
    });

    const auth = createAuthService() as unknown as {
      getAccessToken: jest.Mock;
    };
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            order_id: 'ue_123',
            store_id: 'uber-store-1',
            subtotal_cents: 1000,
            tax_cents: 130,
            total_cents: 1130,
            items: [
              {
                line_item_id: 'line_1',
                item_id: 'uber_item_1',
                external_data: 'menu_item_uber_1',
                title: 'Biang Biang Noodles',
                quantity: 1,
                unit_price: 1000,
                total_price: 1000,
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const orderEventsBus = {
      emitOrderPaidVerified: jest.fn(),
      emitOrderAccepted: jest.fn(),
    };
    const service = new UberOrderService(
      prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
      auth as unknown as ConstructorParameters<typeof UberOrderService>[0],
      orderEventsBus as unknown as ConstructorParameters<
        typeof UberOrderService
      >[0],
    );
    await service.handleWebhook({
      headers: {
        'x-uber-signature': signature,
        'x-event-id': 'evt_123',
      },
      rawBody,
      body,
    });

    expect(auth.getAccessToken).toHaveBeenCalledWith('eats.store.orders.read');
    expect(fetchSpy).toHaveBeenCalledWith(
      body.resource_href,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(prisma.order.findUnique).toHaveBeenCalled();
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'pending' }) as unknown,
      }),
    );
    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'making',
          makingAt: expect.any(Date) as Date,
        }) as unknown,
      }),
    );
    await expect(
      prisma.order.findMany({
        where: {
          status: { in: ['paid', 'making', 'ready'] },
          channel: { in: ['ubereats'] },
          items: { some: {} },
        },
      }),
    ).resolves.toHaveLength(1);
    expect(prisma.uberWebhookInbox.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: 'evt_123' } }),
    );
    expect(orderEventsBus.emitOrderPaidVerified).not.toHaveBeenCalled();
    expect(orderEventsBus.emitOrderAccepted).toHaveBeenCalledTimes(1);
    expect(orderEventsBus.emitOrderAccepted).toHaveBeenCalledWith({
      orderId: 'order-db-id',
      stableId: 'ord_uber_1',
    });
    expect(prisma.orderItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          publishedPriceCents: 800,
          uberBasePriceCents: 1000,
          priceVarianceCents: 200,
        }) as unknown,
      }),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.uber.com/v1/eats/orders/ue_123/accept_pos_order',
      expect.objectContaining({ method: 'POST' }),
    );
    fetchSpy.mockRestore();
  });

  it.each([
    {
      name: '正常促销不改变商品基础价格校验',
      publishedPriceCents: 1000,
      uberBasePriceCents: 1000,
      discountCents: 200,
      hasPromotion: true,
      expectedVariance: 0,
      expectedMaterial: false,
    },
    {
      name: '使用下单时的上一版本菜单价格而不是当前菜单价格',
      publishedPriceCents: 900,
      uberBasePriceCents: 900,
      discountCents: 0,
      hasPromotion: false,
      expectedVariance: 0,
      expectedMaterial: false,
    },
    {
      name: '无折扣时记录基础价格异常',
      publishedPriceCents: 900,
      uberBasePriceCents: 1100,
      discountCents: 0,
      hasPromotion: false,
      expectedVariance: 200,
      expectedMaterial: true,
    },
    {
      name: '一分钱舍入误差只记录而不标记为实质异常',
      publishedPriceCents: 1000,
      uberBasePriceCents: 1001,
      discountCents: 0,
      hasPromotion: false,
      expectedVariance: 1,
      expectedMaterial: false,
    },
  ])('$name', async (scenario) => {
    const orderedAt = new Date('2026-08-05T12:00:00.000Z');
    const createdItems: Array<Record<string, unknown>> = [];
    const events: Array<Record<string, unknown>> = [];
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({
              ...data,
              id: 'order-price-check',
              orderStableId: 'ord-price-check',
            }),
          ),
      },
      orderItem: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            createdItems.push(data);
            return Promise.resolve({ ...data, id: 'order-item-price-check' });
          }),
      },
      menuItem: {
        findFirst: jest.fn().mockResolvedValue({ stableId: 'menu-item-1' }),
      },
      uberItemChannelConfig: { findFirst: jest.fn() },
      uberPublishedMenuItem: {
        findFirst: jest.fn().mockResolvedValue({
          publishedPriceCents: scenario.publishedPriceCents,
        }),
      },
      uberOrderItemModifier: { createMany: jest.fn() },
      uberWebhookInbox: createInboxMock(),
      opsEvent: {
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            events.push(data);
            return Promise.resolve(data);
          }),
      },
    };
    Object.assign(prisma, {
      $transaction: jest.fn(
        (callback: (transaction: typeof prisma) => unknown) => callback(prisma),
      ),
    });
    const service = new UberOrderService(
      prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
      createAuthService(),
    );
    await (
      service as unknown as {
        upsertUberOrder: (
          order: Record<string, unknown>,
          eventType: string,
          eventId: string,
        ) => Promise<unknown>;
      }
    ).upsertUberOrder(
      {
        externalOrderId: `order-${scenario.expectedVariance}`,
        displayId: 'PRICE',
        storeId: 'uber-store-1',
        subtotalCents: scenario.uberBasePriceCents,
        taxCents: 0,
        totalCents: scenario.uberBasePriceCents - scenario.discountCents,
        discountCents: scenario.discountCents,
        hasPromotion: scenario.hasPromotion,
        deliveryFeeCents: 0,
        fulfillmentType: 'pickup',
        estimatedReadyAt: null,
        specialInstructions: null,
        contactName: null,
        contactPhone: null,
        paidAt: orderedAt,
        cancellation: null,
        items: [
          {
            externalLineId: 'line-1',
            externalItemId: 'uber-item-1',
            stableIdHint: 'menu-item-1',
            displayName: 'Noodles',
            quantity: 1,
            baseUnitPriceCents: scenario.uberBasePriceCents,
            optionsUnitPriceCents: 0,
            unitPriceCents: scenario.uberBasePriceCents,
            lineTotalCents: scenario.uberBasePriceCents,
            specialInstructions: null,
            modifiers: [],
          },
        ],
      },
      'orders.notification',
      `event-${scenario.expectedVariance}`,
    );

    expect(prisma.uberPublishedMenuItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          uberItemId: 'uber-item-1',
          publishedAt: { lte: orderedAt },
        }) as unknown,
        orderBy: { publishedAt: 'desc' },
      }),
    );
    expect(createdItems[0]).toMatchObject({
      publishedPriceCents: scenario.publishedPriceCents,
      uberBasePriceCents: scenario.uberBasePriceCents,
      priceVarianceCents: scenario.expectedVariance,
    });
    expect(events.at(-1)?.payload).toMatchObject({
      priceValidationPolicy: 'WARN_AND_ACCEPT',
      hasPromotion: scenario.hasPromotion,
      promotionDiscountCents: scenario.discountCents,
      menuPriceVarianceCents: scenario.expectedVariance,
      hasMenuPriceVariance: scenario.expectedMaterial,
    });
  });

  it('ACCEPT 失败但入 retry outbox 时不会把本地订单推进到 making 或触发打印', async () => {
    const body = {
      event_type: 'orders.notification',
      resource_href: 'https://api.uber.com/v2/eats/order/ue_retry_accept',
      meta: { resource_id: 'ue_retry_accept', user_id: 'user_1' },
      event_id: 'evt_retry_accept',
    };
    const rawBody = JSON.stringify(body);
    const signature = createHmac('sha256', clientSecret)
      .update(rawBody, 'utf8')
      .digest('hex');

    type RetrySavedUberOrder = {
      id: string;
      orderStableId: string;
      status: string;
      clientRequestId: string;
      channel: string;
      items: Array<Record<string, unknown>>;
    };
    type RetryOrderFindUniqueArgs = { where: { clientRequestId?: string } };
    type RetryOrderCreateArgs = {
      data: { status: string; clientRequestId: string; channel: string };
    };
    type RetryOrderUpdateManyArgs = {
      where: { id: string; status: string };
      data: Partial<RetrySavedUberOrder>;
    };
    type RetryOrderItemCreateArgs = { data: Record<string, unknown> };

    let savedOrder: RetrySavedUberOrder | null = null;
    const prisma = {
      order: {
        findUnique: jest
          .fn()
          .mockImplementation(({ where }: RetryOrderFindUniqueArgs) =>
            Promise.resolve(
              where.clientRequestId === 'ubereats:ue_retry_accept'
                ? savedOrder
                : null,
            ),
          ),
        create: jest
          .fn()
          .mockImplementation(({ data }: RetryOrderCreateArgs) => {
            savedOrder = {
              id: 'order-retry-id',
              orderStableId: 'ord_retry_accept',
              status: data.status,
              clientRequestId: data.clientRequestId,
              channel: data.channel,
              items: [],
            };
            return Promise.resolve(savedOrder);
          }),
        updateMany: jest
          .fn()
          .mockImplementation(({ where, data }: RetryOrderUpdateManyArgs) => {
            if (
              savedOrder &&
              savedOrder.id === where.id &&
              savedOrder.status === where.status
            ) {
              savedOrder = { ...savedOrder, ...data };
              return Promise.resolve({ count: 1 });
            }
            return Promise.resolve({ count: 0 });
          }),
      },
      orderItem: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest
          .fn()
          .mockImplementation(({ data }: RetryOrderItemCreateArgs) => {
            savedOrder?.items.push(data);
            return Promise.resolve({ id: 'item-retry-id', ...data });
          }),
      },
      menuItem: {
        findFirst: jest.fn().mockResolvedValue({ stableId: 'menu_item_retry' }),
      },
      uberItemChannelConfig: { findFirst: jest.fn() },
      uberOrderItemModifier: { createMany: jest.fn() },
      uberWebhookInbox: createInboxMock(),
      businessConfig: {
        findUnique: jest.fn().mockResolvedValue({ isTemporarilyClosed: false }),
      },
      uberOrderAction: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'action_retry',
          externalOrderId: 'ue_retry_accept',
          action: 'ACCEPT',
          status: 'PENDING',
          retryable: false,
          uberHttpStatus: null,
        }),
        upsert: jest.fn().mockResolvedValue({ id: 'action_retry' }),
        update: jest.fn().mockResolvedValue({ id: 'action_retry' }),
      },
      opsEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(null),
      },
    };
    Object.assign(prisma, {
      $transaction: jest.fn(
        (callback: (transaction: typeof prisma) => unknown) => callback(prisma),
      ),
    });

    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            order_id: 'ue_retry_accept',
            subtotal_cents: 1000,
            tax_cents: 130,
            total_cents: 1130,
            items: [
              {
                line_item_id: 'line_retry',
                item_id: 'uber_item_retry',
                external_data: 'menu_item_retry',
                title: 'Retry Noodles',
                quantity: 1,
                unit_price: 1000,
                total_price: 1000,
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response('temporarily unavailable', { status: 503 }),
      );
    const orderEventsBus = {
      emitOrderPaidVerified: jest.fn(),
      emitOrderAccepted: jest.fn(),
    };

    const service = new UberOrderService(
      prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
      createAuthService(),
      orderEventsBus as unknown as ConstructorParameters<
        typeof UberOrderService
      >[0],
    );

    await service.handleWebhook({
      headers: { 'x-uber-signature': signature },
      rawBody,
      body,
    });

    expect(prisma.uberOrderAction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          retryable: true,
        }) as unknown,
      }),
    );
    expect(savedOrder?.status).toBe('pending');
    expect(orderEventsBus.emitOrderAccepted).not.toHaveBeenCalled();
    expect(prisma.order.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'making' }) as unknown,
      }),
    );
    fetchSpy.mockRestore();
  });

  it.each(['orders.cancelled', 'orders.cancel'] as const)(
    '%s webhook 会成功处理并保存取消记录',
    async (eventType) => {
      const body = {
        event_type: eventType,
        resource_href: 'https://api.uber.com/v2/eats/order/ue_cancel_1',
        meta: { resource_id: 'ue_cancel_1', user_id: 'user_1' },
        event_id: `evt_${eventType.replace('.', '_')}`,
      };
      const rawBody = JSON.stringify(body);
      const signature = createHmac('sha256', clientSecret)
        .update(rawBody, 'utf8')
        .digest('hex');
      const prisma = {
        order: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'order-db-id',
            orderStableId: 'order-stable-id',
            status: 'paid',
          }),
          update: jest.fn().mockResolvedValue({
            id: 'order-db-id',
            orderStableId: 'order-stable-id',
            status: 'paid',
          }),
        },
        orderItem: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        uberOrderItemModifier: { createMany: jest.fn() },
        uberOrderCancellation: {
          upsert: jest.fn().mockResolvedValue({ id: 'cancel_1' }),
        },
        orderAmendment: {
          upsert: jest.fn().mockResolvedValue({ id: 'amendment_1' }),
        },
        uberWebhookInbox: createInboxMock(),
        businessConfig: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ isTemporarilyClosed: false }),
        },
        uberOrderAction: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'action_1',
            externalOrderId: 'ue_cancel_1',
            action: 'ACCEPT',
            status: 'PENDING',
            retryable: false,
          }),
          upsert: jest.fn().mockResolvedValue({ id: 'action_1' }),
          update: jest.fn().mockResolvedValue({ id: 'action_1' }),
        },
        opsEvent: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue(null),
        },
      };
      Object.assign(prisma, {
        $transaction: jest.fn(
          (callback: (transaction: typeof prisma) => unknown) =>
            callback(prisma),
        ),
      });
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              order_id: 'ue_cancel_1',
              subtotal_cents: 1000,
              tax_cents: 130,
              total_cents: 1130,
              cancelled_at: '2026-08-05T12:00:00.000Z',
              cancellation: {
                cancelled_by: 'CUSTOMER',
                reason_code: 'CUSTOMER_CANCELLED',
                reason: 'Customer cancelled the order',
              },
              items: [],
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(new Response('{}', { status: 200 }));

      await expect(
        new UberOrderService(
          prisma as unknown as ConstructorParameters<
            typeof UberOrderService
          >[0],
          createAuthService(),
        ).handleWebhook({
          headers: { 'x-uber-signature': signature },
          rawBody,
          body,
        }),
      ).resolves.toBeUndefined();

      expect(prisma.uberOrderCancellation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventId: body.event_id },
          create: expect.objectContaining({
            orderId: 'order-db-id',
            externalOrderId: 'ue_cancel_1',
            eventId: body.event_id,
            kind: 'CANCELLED',
            cancelledBy: 'CUSTOMER',
            reasonCode: 'CUSTOMER_CANCELLED',
            reasonDetail: 'Customer cancelled the order',
          }) as unknown,
        }),
      );
      expect(prisma.orderAmendment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            orderId: 'order-db-id',
            refundCents: 1130,
            deltaCents: -1130,
            summaryJson: expect.objectContaining({
              eventId: body.event_id,
              status: 'CONFIRMED',
            }) as unknown,
          }) as unknown,
        }),
      );
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-db-id' },
        data: { status: 'refunded' },
      });
      expect(prisma.uberWebhookInbox.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PROCESSED' }) as unknown,
        }),
      );
      fetchSpy.mockRestore();
    },
  );

  it('自动拒单遇到 Uber 400 不抛 502 并保存失败详情', async () => {
    const body = {
      event_type: 'orders.notification',
      resource_href: 'https://api.uber.com/v2/eats/order/ue_deny_400',
      meta: { resource_id: 'ue_deny_400', user_id: 'user_1' },
      event_id: 'evt_deny_400',
    };
    const rawBody = JSON.stringify(body);
    const signature = createHmac('sha256', clientSecret)
      .update(rawBody, 'utf8')
      .digest('hex');
    let action: Record<string, unknown> | null = null;
    const prisma = {
      order: { findUnique: jest.fn(), create: jest.fn() },
      orderItem: { deleteMany: jest.fn(), create: jest.fn() },
      menuItem: { findFirst: jest.fn() },
      uberItemChannelConfig: { findFirst: jest.fn() },
      uberOrderItemModifier: { createMany: jest.fn() },
      uberWebhookInbox: createInboxMock(),
      businessConfig: {
        findUnique: jest.fn().mockResolvedValue({
          isTemporarilyClosed: true,
          temporaryCloseReason: '门店暂停营业',
        }),
      },
      uberOrderAction: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(action)),
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            action = {
              id: 'deny_action',
              retryable: false,
              uberHttpStatus: null,
              attemptCount: 1,
              ...data,
            };
            return Promise.resolve(action);
          }),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            action = { ...action, ...data };
            return Promise.resolve(action);
          }),
      },
      opsEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(null),
      },
    };
    Object.assign(prisma, {
      $transaction: jest.fn(
        (callback: (transaction: typeof prisma) => unknown) => callback(prisma),
      ),
    });
    jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            order_id: 'ue_deny_400',
            subtotal_cents: 1000,
            tax_cents: 130,
            total_cents: 1130,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response('{"error":"already rejected"}', { status: 400 }),
      );

    const service = new UberOrderService(
      prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
      createAuthService(),
    );
    await expect(
      service.handleWebhook({
        headers: { 'x-uber-signature': signature },
        rawBody,
        body,
      }),
    ).resolves.toBeUndefined();

    expect(prisma.uberOrderAction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          retryable: false,
          uberHttpStatus: 400,
          lastError: expect.stringContaining('already rejected') as unknown,
        }) as unknown,
      }),
    );
    expect(prisma.opsEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventName: 'ubereats_webhook_auto_deny_failed',
        }) as unknown,
      }),
    );
    expect(prisma.uberWebhookInbox.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PROCESSED' }) as unknown,
      }),
    );
    jest.restoreAllMocks();
  });

  it('本地订单落库后 Uber 接单 500 不再使 webhook 失败并保留可重试 outbox', async () => {
    const body = {
      event_type: 'orders.notification',
      resource_href: 'https://api.uber.com/v2/eats/order/ue_accept_500',
      meta: { resource_id: 'ue_accept_500', user_id: 'user_1' },
      event_id: 'evt_accept_500',
    };
    const rawBody = JSON.stringify(body);
    const signature = createHmac('sha256', clientSecret)
      .update(rawBody, 'utf8')
      .digest('hex');
    let action: Record<string, unknown> | null = null;
    const prisma = {
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValue({ id: 'order-db-id' }),
        create: jest.fn().mockResolvedValue({
          id: 'order-db-id',
          orderStableId: 'ord_uber_retry',
          status: 'paid',
        }),
      },
      orderItem: { deleteMany: jest.fn(), create: jest.fn() },
      menuItem: { findFirst: jest.fn() },
      uberItemChannelConfig: { findFirst: jest.fn() },
      uberOrderItemModifier: { createMany: jest.fn() },
      uberWebhookInbox: createInboxMock(),
      businessConfig: {
        findUnique: jest.fn().mockResolvedValue({ isTemporarilyClosed: false }),
      },
      uberOrderAction: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(action)),
        upsert: jest
          .fn()
          .mockImplementation(
            ({ create }: { create: Record<string, unknown> }) => {
              action ??= {
                id: 'accept_action',
                retryable: false,
                uberHttpStatus: null,
                attemptCount: 0,
                ...create,
              };
              return Promise.resolve(action);
            },
          ),
        create: jest.fn(),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            action = { ...action, ...data };
            return Promise.resolve(action);
          }),
      },
      opsEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(null),
      },
    };
    Object.assign(prisma, {
      $transaction: jest.fn(
        (callback: (transaction: typeof prisma) => unknown) => callback(prisma),
      ),
    });
    jest.spyOn(AppLogger.prototype, 'error').mockImplementation();
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            order_id: 'ue_accept_500',
            subtotal_cents: 1000,
            tax_cents: 130,
            total_cents: 1130,
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response('{"error":"temporary"}', { status: 500 }),
      );

    const service = new UberOrderService(
      prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
      createAuthService(),
    );
    await expect(
      service.handleWebhook({
        headers: { 'x-uber-signature': signature },
        rawBody,
        body,
      }),
    ).resolves.toBeUndefined();

    expect(prisma.uberOrderAction.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          externalOrderId_action: {
            externalOrderId: 'ue_accept_500',
            action: 'ACCEPT',
          },
        },
        create: expect.objectContaining({ status: 'PENDING' }) as unknown,
      }),
    );
    expect(prisma.uberOrderAction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          retryable: true,
        }) as unknown,
      }),
    );
    expect(prisma.opsEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventName: 'ubereats_order_accept_retry_queued',
        }) as unknown,
      }),
    );
    jest.restoreAllMocks();
  });

  it('解析多数量、嵌套 modifier、特殊说明、折扣、税费和未知商品快照', () => {
    const service = new UberOrderService(
      createSignatureOnlyPrisma() as unknown as ConstructorParameters<
        typeof UberOrderService
      >[0],
      createAuthService(),
    );
    const parsed = (
      service as unknown as {
        parseOrderPayload(payload: unknown): {
          displayId: string;
          discountCents: number;
          taxCents: number;
          items: Array<{
            quantity: number;
            displayName: string;
            specialInstructions: string | null;
            optionsUnitPriceCents: number;
            modifiers: Array<{ children: unknown[] }>;
          }>;
        };
      }
    ).parseOrderPayload({
      order_id: 'ue_complex',
      display_id: 'A-2048',
      subtotal_cents: 2700,
      discount_cents: 300,
      tax_cents: 312,
      total_cents: 2712,
      items: [
        {
          line_item_id: 'line_unknown',
          item_id: 'not-in-local-menu',
          title: 'External noodle snapshot',
          quantity: 2,
          unit_price: 1350,
          total_price: 2700,
          special_instructions: '不要香菜',
          modifiers: [
            {
              id: 'size-large',
              title: 'Large',
              quantity: 1,
              price_delta: 200,
              modifiers: [
                {
                  id: 'extra-meat',
                  title: 'Extra meat',
                  quantity: 2,
                  price_delta: 75,
                },
              ],
            },
          ],
        },
      ],
    });

    expect(parsed).toMatchObject({
      displayId: 'A-2048',
      discountCents: 300,
      taxCents: 312,
    });
    expect(parsed.items[0]).toMatchObject({
      quantity: 2,
      displayName: 'External noodle snapshot',
      specialInstructions: '不要香菜',
      optionsUnitPriceCents: 350,
    });
    expect(parsed.items[0].modifiers[0].children).toHaveLength(1);
  });

  it.each([
    [
      '优先使用官方 pickup_code',
      { pickup_code: 'PIN-2468', display_id: 'DISPLAY-99' },
      'PIN-2468',
      'DISPLAY-99',
    ],
    [
      '缺少官方字段时使用 display_id',
      { display_id: 'DISPLAY-99' },
      'DISPLAY-99',
      'DISPLAY-99',
    ],
    ['两个字段均缺失时不回退到 order_id', {}, null, null],
  ])('%s', (_label, identifiers, pickupCode, displayId) => {
    const service = new UberOrderService(
      createSignatureOnlyPrisma() as unknown as ConstructorParameters<
        typeof UberOrderService
      >[0],
      createAuthService(),
    );
    const parsed = (
      service as unknown as {
        parseOrderPayload(payload: unknown): {
          externalOrderId: string;
          pickupCode: string | null;
          displayId: string | null;
        };
      }
    ).parseOrderPayload({
      order_id: 'uber-uuid-must-not-be-a-pickup-code',
      total_cents: 100,
      ...identifiers,
    });

    expect(parsed).toMatchObject({
      externalOrderId: 'uber-uuid-must-not-be-a-pickup-code',
      pickupCode,
      displayId,
    });
  });

  it('重复 webhook 更新取餐码，缺失取餐码的后续通知不清空已有值', async () => {
    const update = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'db-order-1',
        orderStableId: 'internal-stable-id',
        status: 'pending',
        ...data,
      }),
    );
    let existingPickupCode: string | null = 'DISPLAY-OLD';
    const tx = {
      order: {
        findUnique: jest.fn().mockImplementation(() =>
          Promise.resolve({
            id: 'db-order-1',
            orderStableId: 'internal-stable-id',
            status: 'pending',
            pickupCode: existingPickupCode,
          }),
        ),
        update,
      },
      orderItem: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      uberWebhookInbox: { upsert: jest.fn().mockResolvedValue(null) },
    };
    const prisma = {
      ...createSignatureOnlyPrisma(),
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new UberOrderService(
      prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
      createAuthService(),
    );
    const api = service as unknown as {
      parseOrderPayload(payload: unknown): unknown;
      upsertUberOrder(
        order: unknown,
        eventType: string,
        eventId: string,
      ): Promise<unknown>;
    };

    const withOfficialCode = api.parseOrderPayload({
      order_id: 'uber-order-1',
      pickup_code: 'PIN-NEW',
      display_id: 'DISPLAY-NEW',
      total_cents: 100,
    });
    await api.upsertUberOrder(
      withOfficialCode,
      'orders.notification',
      'event-1',
    );
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pickupCode: 'PIN-NEW',
          externalDisplayId: 'DISPLAY-NEW',
        }) as unknown,
      }),
    );

    existingPickupCode = 'PIN-NEW';
    const withoutCodes = api.parseOrderPayload({
      order_id: 'uber-order-1',
      total_cents: 100,
    });
    await api.upsertUberOrder(withoutCodes, 'orders.notification', 'event-2');
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pickupCode: 'PIN-NEW' }) as unknown,
      }),
    );
  });

  it('解析 Uber v2 订单详情中的 payment.charges 金额和 cart 商品', () => {
    const service = new UberOrderService(
      createSignatureOnlyPrisma() as unknown as ConstructorParameters<
        typeof UberOrderService
      >[0],
      createAuthService(),
    );
    const parsed = (
      service as unknown as {
        parseOrderPayload(payload: unknown): {
          externalOrderId: string;
          storeId: string;
          contactName: string;
          specialInstructions: string;
          subtotalCents: number;
          discountCents: number;
          taxCents: number;
          totalCents: number;
          deliveryFeeCents: number;
          items: Array<{
            externalLineId: string;
            externalItemId: string;
            stableIdHint: string;
            unitPriceCents: number;
            lineTotalCents: number;
          }>;
        };
      }
    ).parseOrderPayload({
      id: 'ue_v2',
      display_id: 'ABCDE',
      store: { id: 'store_v2' },
      eater: { first_name: 'Test', last_name: 'Eater', phone: '+10000000000' },
      cart: {
        special_instructions: '少辣',
        items: [
          {
            id: 'menu_item_1',
            instance_id: 'line_v2_1',
            external_data: 'local_stable_1',
            title: 'Liang Pi',
            quantity: 2,
            price: {
              unit_price: { amount: 1200 },
              total_price: { amount: 2400 },
            },
          },
        ],
      },
      payment: {
        charges: {
          sub_total: { amount: 2400 },
          sub_total_promo_applied: { amount: 2200 },
          tax_promo_applied: { amount: 286 },
          tax: { amount: 312 },
          delivery_fee: { amount: 0 },
          total: { amount: 2486 },
        },
      },
      placed_at: '2026-08-05T13:23:40+00:00',
    });

    expect(parsed).toMatchObject({
      externalOrderId: 'ue_v2',
      storeId: 'store_v2',
      contactName: 'Test Eater',
      specialInstructions: '少辣',
      subtotalCents: 2400,
      discountCents: 200,
      taxCents: 286,
      deliveryFeeCents: 0,
      totalCents: 2486,
    });
    expect(parsed.items[0]).toMatchObject({
      externalLineId: 'line_v2_1',
      externalItemId: 'menu_item_1',
      stableIdHint: 'local_stable_1',
      unitPriceCents: 1200,
      lineTotalCents: 2400,
    });
  });

  it('sandbox 下允许 production resource_href 但请求 test-api', async () => {
    process.env.UBER_EATS_API_BASE_URL = 'https://test-api.uber.com';
    process.env.UBER_EATS_RESOURCE_HREF_ALLOWED_ORIGINS =
      'https://api.uber.com';
    const body = {
      event_type: 'orders.notification',
      resource_href: 'https://api.uber.com/v2/eats/order/ue_sandbox',
      meta: { resource_id: 'ue_sandbox', user_id: 'user_1' },
      event_id: 'evt_sandbox_href',
    };
    const rawBody = JSON.stringify(body);
    const signature = createHmac('sha256', clientSecret)
      .update(rawBody, 'utf8')
      .digest('hex');
    const prisma = {
      uberWebhookInbox: createInboxMock(),
      opsEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(null),
      },
    };
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(new Response('upstream unavailable', { status: 503 })),
      );
    const service = new UberOrderService(
      prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
      createAuthService(),
    );

    await expect(
      service.handleWebhook({
        headers: { 'x-uber-signature': signature },
        rawBody,
        body,
      }),
    ).rejects.toThrow('Uber 订单详情接口返回错误');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://test-api.uber.com/v2/eats/order/ue_sandbox',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('production 下允许并请求 api.uber.com resource_href', async () => {
    process.env.UBER_EATS_API_BASE_URL = 'https://api.uber.com';
    process.env.UBER_EATS_RESOURCE_HREF_ALLOWED_ORIGINS =
      'https://api.uber.com';
    const body = {
      event_type: 'orders.notification',
      resource_href: 'https://api.uber.com/v2/eats/order/ue_prod',
      meta: { resource_id: 'ue_prod', user_id: 'user_1' },
      event_id: 'evt_prod_href',
    };
    const rawBody = JSON.stringify(body);
    const signature = createHmac('sha256', clientSecret)
      .update(rawBody, 'utf8')
      .digest('hex');
    const prisma = {
      uberWebhookInbox: createInboxMock(),
      opsEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(null),
      },
    };
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(new Response('upstream unavailable', { status: 503 })),
      );
    const service = new UberOrderService(
      prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
      createAuthService(),
    );

    await expect(
      service.handleWebhook({
        headers: { 'x-uber-signature': signature },
        rawBody,
        body,
      }),
    ).rejects.toThrow('Uber 订单详情接口返回错误');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.uber.com/v2/eats/order/ue_prod',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('拒绝带 username/password 的 resource_href', () => {
    const service = new UberOrderService(
      createSignatureOnlyPrisma() as unknown as ConstructorParameters<
        typeof UberOrderService
      >[0],
      createAuthService(),
    ) as unknown as {
      buildUberApiUrlFromResourceHref(resourceHref: string): string;
    };

    expect(() =>
      service.buildUberApiUrlFromResourceHref(
        'https://user:pass@api.uber.com/v2/eats/order/ue_credential',
      ),
    ).toThrow('Uber resource_href 不属于允许的来源');
  });

  it('origin 不匹配时拒绝 resource_href，并只记录 origin/path 非敏感信息', async () => {
    process.env.UBER_EATS_API_BASE_URL = 'https://api.uber.com';
    process.env.UBER_EATS_RESOURCE_HREF_ALLOWED_ORIGINS =
      'https://api.uber.com, https://test-api.uber.com';
    const warnSpy = jest
      .spyOn(AppLogger.prototype, 'warn')
      .mockImplementation();
    const body = {
      event_type: 'orders.notification',
      resource_href:
        'https://evil.example/v2/eats/order/ue_123?customer_name=Alice&phone=4165551234&address=1%20Main%20St&Authorization=Bearer%20secret-token',
      meta: { resource_id: 'ue_123', user_id: 'user_1' },
      event_id: 'evt_bad_href',
    };
    const rawBody = JSON.stringify(body);
    const signature = createHmac('sha256', clientSecret)
      .update(rawBody, 'utf8')
      .digest('hex');
    const prisma = {
      uberWebhookInbox: createInboxMock(),
      opsEvent: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new UberOrderService(
      prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
      createAuthService(),
    );

    await expect(
      service.handleWebhook({
        headers: { 'x-uber-signature': signature },
        rawBody,
        body,
      }),
    ).rejects.toThrow('Uber resource_href 不属于允许的来源');

    const logs = warnSpy.mock.calls.flat().join(' ');
    expect(logs).toContain('ubereats webhook resource_href rejected');
    expect(logs).toContain('resourceOrigin=https://evil.example');
    expect(logs).toContain('resourcePathname=/v2/eats/order/ue_123');
    expect(logs).toContain(
      'allowedOrigins=https://api.uber.com,https://test-api.uber.com',
    );
    expect(logs).toContain('uberApiOrigin=https://api.uber.com');
    for (const sensitive of [
      'customer_name',
      'Alice',
      'phone',
      '4165551234',
      'address',
      '1%20Main%20St',
      'Authorization',
      'secret-token',
    ]) {
      expect(logs).not.toContain(sensitive);
    }
    delete process.env.UBER_EATS_API_BASE_URL;
  });

  it.each([401, 403])(
    '订单详情 GET 返回 %i 时刷新后消费不可恢复失败并脱敏日志',
    async (status) => {
      const body = {
        event_type: 'orders.notification',
        resource_href:
          'https://api.uber.com/v2/eats/order/ue_auth?customer_name=Alice&phone=4165551234&access_token=query-secret',
        meta: { resource_id: 'ue_auth', user_id: 'user_1' },
        event_id: `evt_auth_${status}`,
      };
      const rawBody = JSON.stringify(body);
      const signature = createHmac('sha256', clientSecret)
        .update(rawBody, 'utf8')
        .digest('hex');
      const prisma = {
        uberWebhookInbox: createInboxMock(),
        opsEvent: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
        },
      };
      const errorSpy = jest
        .spyOn(AppLogger.prototype, 'error')
        .mockImplementation();
      const authErrorResponse = new Response(
        JSON.stringify({
          code: 'insufficient_scope',
          message:
            'Bearer upstream-secret access_token=body-secret client_secret=client-secret missing store authorization',
          customer: {
            name: 'Alice',
            phone: '4165551234',
            address: '1 Main St',
          },
        }),
        {
          status,
          headers: { 'x-uber-request-id': 'uber_req_auth' },
        },
      );
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(authErrorResponse)
        .mockResolvedValueOnce(authErrorResponse.clone());
      const service = new UberOrderService(
        prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
        createAuthService(),
      );

      await expect(
        service.handleWebhook({
          headers: { 'x-uber-signature': signature },
          rawBody,
          body,
        }),
      ).resolves.toBeUndefined();

      expect(prisma.uberWebhookInbox.updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FAILED',
            errorSummary: expect.stringContaining(
              'missing store authorization',
            ) as unknown,
            nextRetryAt: null,
          }) as unknown,
        }),
      );

      const logs = errorSpy.mock.calls.flat().join(' ');
      expect(logs).toContain(`status=${status}`);
      expect(logs).toContain('eventId=evt_auth_');
      expect(logs).toContain('resourceId=ue_auth');
      expect(logs).toContain(
        'resourceUrl=https://api.uber.com/v2/eats/order/ue_auth',
      );
      expect(logs).toContain('uberRequestId=uber_req_auth');
      expect(logs).toContain('insufficient_scope');
      for (const sensitive of [
        'upstream-secret',
        'body-secret',
        'client-secret',
        'customer_name',
        'Alice',
        '4165551234',
        '1 Main St',
        'query-secret',
      ]) {
        expect(logs).not.toContain(sensitive);
      }
    },
  );

  it.each([429, 503])('Uber %i 时保留通知为可重试失败', async (status) => {
    const body = {
      event_type: 'orders.notification',
      resource_href: 'https://api.uber.com/v2/eats/order/ue_retry',
      meta: { resource_id: 'ue_retry', user_id: 'user_1' },
      event_id: `evt_${status}`,
    };
    const rawBody = JSON.stringify(body);
    const signature = createHmac('sha256', clientSecret)
      .update(rawBody, 'utf8')
      .digest('hex');
    const prisma = {
      uberWebhookInbox: createInboxMock(),
      opsEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    };
    jest
      .spyOn(global, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(new Response('upstream unavailable', { status })),
      );
    const service = new UberOrderService(
      prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
      createAuthService(),
    );

    await expect(
      service.handleWebhook({
        headers: { 'x-uber-signature': signature },
        rawBody,
        body,
      }),
    ).rejects.toMatchObject({ status: 502 });
    expect(prisma.opsEvent.create).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  const createActionPrisma = (
    localOrder: object | null = { id: 'local_1' },
  ) => {
    let action: Record<string, unknown> | null = null;
    return {
      order: { findUnique: jest.fn().mockResolvedValue(localOrder) },
      uberOrderAction: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(action)),
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            action = {
              id: 'action_1',
              retryable: false,
              uberHttpStatus: null,
              ...data,
            };
            return Promise.resolve(action);
          }),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            action = { ...action, ...data };
            return Promise.resolve(action);
          }),
      },
    };
  };

  it('只有本地订单完整落库后才调用 Uber 接单 endpoint', async () => {
    const missing = createActionPrisma(null);
    const service = new UberOrderService(
      missing as unknown as ConstructorParameters<typeof UberOrderService>[0],
      createAuthService(),
    );
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(service.acceptUberOrder('ue_missing')).rejects.toThrow(
      '订单尚未完整落库',
    );
    expect(fetchSpy).not.toHaveBeenCalled();

    const prisma = createActionPrisma();
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const persisted = new UberOrderService(
      prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
      createAuthService(),
    );
    await expect(persisted.acceptUberOrder('ue_saved')).resolves.toMatchObject({
      ok: true,
      duplicate: false,
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.uber.com/v1/eats/orders/ue_saved/accept_pos_order',
      expect.objectContaining({
        method: 'POST',
        body: '{"reason":"accepted"}',
      }),
    );
  });

  it('重复接单复用唯一动作记录且不重复请求 Uber', async () => {
    const prisma = createActionPrisma();
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const service = new UberOrderService(
      prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
      createAuthService(),
    );
    await service.acceptUberOrder('ue_duplicate');
    await expect(
      service.acceptUberOrder('ue_duplicate'),
    ).resolves.toMatchObject({
      duplicate: true,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('fallback 可将并发 paid 订单推进到 making，重复 ACCEPT 只发送一次 accepted', async () => {
    const prisma = createActionPrisma({
      id: 'order_1',
      orderStableId: 'stable_1',
      status: 'paid',
      paidAt: new Date('2026-08-03T12:00:00Z'),
    }) as ReturnType<typeof createActionPrisma> & {
      order: {
        findUnique: jest.Mock;
        updateMany: jest.Mock;
      };
    };
    let localStatus = 'paid';
    prisma.order.findUnique.mockImplementation(() =>
      Promise.resolve({
        id: 'order_1',
        orderStableId: 'stable_1',
        status: localStatus,
        paidAt: new Date('2026-08-03T12:00:00Z'),
      }),
    );
    prisma.order.updateMany = jest
      .fn()
      .mockImplementation(
        ({ where }: { where: { status: { in: string[] } } }) => {
          const canAccept = where.status.in.includes(localStatus);
          if (canAccept) localStatus = 'making';
          return Promise.resolve({ count: canAccept ? 1 : 0 });
        },
      );
    const bus = { emitOrderAccepted: jest.fn() };
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const service = new UberOrderService(
      prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
      createAuthService(),
      bus as unknown as ConstructorParameters<typeof UberOrderService>[0],
    );

    await service.acceptUberOrder('ue_paid');
    await service.acceptUberOrder('ue_paid');

    expect(localStatus).toBe('making');
    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'order_1',
          status: { in: ['pending', 'paid'] },
        },
      }),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(bus.emitOrderAccepted).toHaveBeenCalledTimes(1);
  });

  it('拒单 endpoint 保存业务原因 payload', async () => {
    const prisma = createActionPrisma();
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const service = new UberOrderService(
      prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
      createAuthService(),
    );
    await service.denyUberOrder('ue_deny', 'STORE_CLOSED', '门店暂停');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.uber.com/v1/eats/orders/ue_deny/deny_pos_order',
      expect.objectContaining({
        body: JSON.stringify({
          reason: {
            code: 'STORE_CLOSED',
            explanation: '门店暂停',
          },
        }),
      }),
    );
    expect(prisma.uberOrderAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reasonCode: 'STORE_CLOSED',
          reasonDetail: '门店暂停',
        }) as unknown,
      }),
    );
  });

  it.each([
    ['STORE_CLOSED', 'STORE_CLOSED'],
    ['ITEM_UNAVAILABLE', 'ITEM_AVAILABILITY'],
    ['INVALID_ORDER', 'OTHER'],
  ])(
    '拒单原因 %s 通过同一个 builder 映射为 Uber code %s',
    async (localReason, uberReason) => {
      const prisma = createActionPrisma();
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response('{}', { status: 200 }));
      const service = new UberOrderService(
        prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
        createAuthService(),
      );

      await service.denyUberOrder(`ue_${localReason}`, localReason, '业务原因');

      const requestBody = fetchSpy.mock.calls[0]?.[1]?.body;
      expect(typeof requestBody).toBe('string');
      expect(JSON.parse(requestBody as string)).toEqual({
        reason: {
          code: uberReason,
          explanation: '业务原因',
        },
      });
    },
  );

  it('Uber 超时/网络错误标记为可重试并保存脱敏错误', async () => {
    const prisma = createActionPrisma();
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('timeout token=secret'));
    const service = new UberOrderService(
      prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
      createAuthService(),
    );
    await expect(
      service.denyUberOrder('ue_timeout', 'INVALID_ORDER'),
    ).rejects.toMatchObject({ status: 502 });
    expect(prisma.uberOrderAction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ retryable: true }) as unknown,
      }),
    );
  });

  it('人工拒单遇到 Uber 400 仍向调用方暴露失败', async () => {
    const prisma = createActionPrisma();
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response('{"error":"invalid deny"}', { status: 400 }),
      );
    const service = new UberOrderService(
      prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
      createAuthService(),
    );

    await expect(
      service.denyUberOrder('ue_manual_400', 'INVALID_ORDER'),
    ).rejects.toMatchObject({ status: 502 });
    expect(prisma.uberOrderAction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          retryable: false,
          uberHttpStatus: 400,
        }) as unknown,
      }),
    );
  });

  it('Uber action endpoint 返回非 2xx 时记录 action/status/request id 的脱敏日志', async () => {
    const prisma = createActionPrisma();
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: 'invalid_order',
          message:
            'Bearer upstream-secret access_token=body-secret customer_name=Alice phone=4165551234 address=1 Main St',
          customer: {
            name: 'Alice',
            phone: '4165551234',
            address: '1 Main St',
          },
        }),
        {
          status: 429,
          headers: { 'x-request-id': 'uber-action-request-1' },
        },
      ),
    );
    const errorSpy = jest
      .spyOn(AppLogger.prototype, 'error')
      .mockImplementation();
    const service = new UberOrderService(
      prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
      createAuthService(),
    );

    try {
      await service.acceptUberOrder('ue_failed');
      throw new Error('expected acceptUberOrder to reject');
    } catch (error) {
      expect(error).toMatchObject({ status: 502 });
      expect(
        typeof (error as { getResponse?: unknown }).getResponse === 'function'
          ? (error as { getResponse: () => unknown }).getResponse()
          : null,
      ).toMatchObject({
        ok: false,
        externalOrderId: 'ue_failed',
        action: 'ACCEPT',
        endpoint: '/v1/eats/orders/ue_failed/accept_pos_order',
        status: 429,
        uberRequestId: 'uber-action-request-1',
        retryable: true,
      });
      expect(
        JSON.stringify((error as { getResponse: () => unknown }).getResponse()),
      ).not.toContain('Alice');
    }

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('action=ACCEPT'),
    );
    const logs = errorSpy.mock.calls
      .map(([message]) => String(message))
      .join('\n');
    expect(logs).toContain('status=429');
    expect(logs).toContain('retryable=true');
    expect(logs).toContain('uberRequestId=uber-action-request-1');
    expect(logs).toContain(
      'endpoint=/v1/eats/orders/ue_failed/accept_pos_order',
    );
    for (const sensitive of [
      'upstream-secret',
      'body-secret',
      'Alice',
      '4165551234',
      '1 Main St',
    ]) {
      expect(logs).not.toContain(sensitive);
    }
  });

  const createReadyPrisma = (initialStatus = 'making') => {
    let localStatus = initialStatus;
    let action: Record<string, unknown> | null = null;
    const uberOrderAction = {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(action)),
      upsert: jest
        .fn()
        .mockImplementation(
          ({ create }: { create: Record<string, unknown> }) => {
            action ??= {
              id: 'ready_action',
              retryable: false,
              uberHttpStatus: null,
              attemptCount: 0,
              ...create,
            };
            return Promise.resolve(action);
          },
        ),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          const attempt = data.attemptCount as
            | { increment?: number }
            | undefined;
          action = {
            ...action,
            ...data,
            attemptCount:
              Number(action?.attemptCount ?? 0) + (attempt?.increment ?? 0),
          };
          return Promise.resolve(action);
        }),
      findMany: jest.fn().mockResolvedValue([]),
    };
    const prisma = {
      order: {
        findUnique: jest.fn().mockImplementation(() =>
          Promise.resolve({
            id: 'local_ready',
            orderStableId: 'stable_ready',
            status: localStatus,
          }),
        ),
      },
      uberOrderAction,
      opsEvent: { create: jest.fn().mockResolvedValue(null) },
      $transaction: jest
        .fn()
        .mockImplementation(
          async (callback: (tx: unknown) => Promise<unknown>) =>
            callback({
              order: {
                findUnique: jest
                  .fn()
                  .mockImplementation(() =>
                    Promise.resolve({ status: localStatus }),
                  ),
                updateMany: jest.fn().mockImplementation(() => {
                  if (!['paid', 'making'].includes(localStatus)) {
                    return Promise.resolve({ count: 0 });
                  }
                  localStatus = 'ready';
                  return Promise.resolve({ count: 1 });
                }),
              },
              uberOrderAction,
            }),
        ),
    };
    return { prisma, uberOrderAction };
  };

  it('ready 只在已接单后入 outbox，成功后重复 ready 不重复请求', async () => {
    const { prisma, uberOrderAction } = createReadyPrisma();
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('{}', {
        status: 200,
        headers: { 'x-request-id': 'uber-request-1' },
      }),
    );
    const service = new UberOrderService(
      prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
      createAuthService(),
    );

    await expect(
      service.syncOrderStatusToUber('ue_ready', 'ready'),
    ).resolves.toMatchObject({
      ok: true,
      action: 'READY_FOR_PICKUP',
    });
    await service.syncOrderStatusToUber('ue_ready', 'ready');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.uber.com/v1/delivery/order/ue_ready/ready',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(uberOrderAction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SUCCEEDED',
          uberRequestId: 'uber-request-1',
        }) as unknown,
      }),
    );
  });

  it('sandbox ready 使用 delivery order 路由和 test-api base URL', async () => {
    process.env.UBER_EATS_API_BASE_URL = 'https://test-api.uber.com';
    const { prisma } = createReadyPrisma();
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const service = new UberOrderService(
      prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
      createAuthService(),
    );

    await service.syncOrderStatusToUber('ue_ready/test', 'ready');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://test-api.uber.com/v1/delivery/order/ue_ready%2Ftest/ready',
      expect.objectContaining({ method: 'POST', body: '{}' }),
    );
  });

  it('ready 路由变更不影响 accept_pos_order 和 deny_pos_order', async () => {
    const acceptFetch = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(new Response('{}', { status: 200 })),
      );
    const acceptService = new UberOrderService(
      createActionPrisma() as unknown as ConstructorParameters<
        typeof UberOrderService
      >[0],
      createAuthService(),
    );
    await acceptService.acceptUberOrder('ue_accept/regression');
    expect(acceptFetch).toHaveBeenLastCalledWith(
      'https://api.uber.com/v1/eats/orders/ue_accept%2Fregression/accept_pos_order',
      expect.objectContaining({ method: 'POST' }),
    );

    const denyService = new UberOrderService(
      createActionPrisma() as unknown as ConstructorParameters<
        typeof UberOrderService
      >[0],
      createAuthService(),
    );
    await denyService.denyUberOrder('ue_deny/regression', 'STORE_CLOSED');
    expect(acceptFetch).toHaveBeenLastCalledWith(
      'https://api.uber.com/v1/eats/orders/ue_deny%2Fregression/deny_pos_order',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('并发推进 ready 时保持幂等且不会把状态回退', async () => {
    const { prisma } = createReadyPrisma();
    jest
      .spyOn(global, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(new Response('{}', { status: 200 })),
      );
    const service = new UberOrderService(
      prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
      createAuthService(),
    );

    const results = await Promise.all([
      service.syncOrderStatusToUber('ue_ready', 'ready'),
      service.syncOrderStatusToUber('ue_ready', 'ready'),
    ]);

    expect(results).toHaveLength(2);
    expect(results).toEqual([
      expect.objectContaining({ status: 'ready' }),
      expect.objectContaining({ status: 'ready' }),
    ]);
    expect(prisma.order.findUnique).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { clientRequestId: 'ubereats:ue_ready' },
      }),
    );
  });

  it('ready 前未 accept 或发生并发状态变化时拒绝且不请求 Uber', async () => {
    for (const state of ['pending', 'completed']) {
      const { prisma } = createReadyPrisma(state);
      const service = new UberOrderService(
        prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
        createAuthService(),
      );
      const fetchSpy = jest.spyOn(global, 'fetch');
      await expect(
        service.syncOrderStatusToUber(`ue_${state}`, 'ready'),
      ).rejects.toThrow('必须先接单');
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  });

  it.each([
    [409, false, 'SUCCEEDED'],
    [404, false, 'FAILED'],
    [429, true, 'FAILED'],
    [500, true, 'FAILED'],
  ])(
    'ready 处理 Uber %s：retryable=%s',
    async (status, retryable, savedStatus) => {
      const { prisma, uberOrderAction } = createReadyPrisma();
      jest.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response('{"error":"upstream"}', {
          status,
          headers: { 'uber-request-id': `request-${status}` },
        }),
      );
      const service = new UberOrderService(
        prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
        createAuthService(),
      );
      const promise = service.syncOrderStatusToUber(`ue_${status}`, 'ready');
      const actionResultMatcher: unknown = expect.objectContaining({
        retryable,
      });
      const updateDataMatcher: unknown = expect.objectContaining({
        status: savedStatus,
        retryable,
        uberRequestId: `request-${status}`,
      });
      await expect(promise).resolves.toMatchObject({
        ok: true,
        localStatus: 'ready',
        uberSyncStatus: savedStatus,
        actionResult: actionResultMatcher,
      });
      expect(uberOrderAction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: updateDataMatcher,
        }),
      );
    },
  );

  it('ready 网络超时保留本地 ready 并返回可重试动作结果', async () => {
    const { prisma, uberOrderAction } = createReadyPrisma();
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(
        Object.assign(new Error('request timed out'), { name: 'AbortError' }),
      );
    const service = new UberOrderService(
      prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
      createAuthService(),
    );
    const actionResultMatcher: unknown = expect.objectContaining({
      status: 'FAILED',
      retryable: true,
      actionId: 'ready_action',
    });
    const updateDataMatcher: unknown = expect.objectContaining({
      status: 'FAILED',
      retryable: true,
    });

    await expect(
      service.syncOrderStatusToUber('ue_timeout_ready', 'ready'),
    ).resolves.toMatchObject({
      localStatus: 'ready',
      uberSyncStatus: 'FAILED',
      actionResult: actionResultMatcher,
    });
    expect(uberOrderAction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: updateDataMatcher,
      }),
    );
  });

  it('ready 失败后成功重试复用同一个 outbox 动作', async () => {
    const { prisma, uberOrderAction } = createReadyPrisma();
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 500 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const service = new UberOrderService(
      prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
      createAuthService(),
    );

    await service.syncOrderStatusToUber('ue_retry_ready', 'ready');
    await expect(
      service.retryReadyForPickup('ue_retry_ready'),
    ).resolves.toMatchObject({
      ok: true,
      actionId: 'ready_action',
      status: 'SUCCEEDED',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(uberOrderAction.upsert).toHaveBeenCalledTimes(1);
  });

  it('同步订单状态时，找不到订单会返回失败', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      opsEvent: {
        create: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new UberOrderService(
      prisma as unknown as ConstructorParameters<typeof UberOrderService>[0],
      createAuthService(),
    );
    const result = await service.syncOrderStatusToUber('ue_not_found', 'ready');

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('ORDER_NOT_FOUND');
  });
});
