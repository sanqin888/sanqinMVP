jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  Channel: { web: 'web', ubereats: 'ubereats' },
  FulfillmentType: { pickup: 'pickup' },
  OrderFulfillmentTiming: { IMMEDIATE: 'IMMEDIATE', SCHEDULED: 'SCHEDULED' },
  OrderStatus: {
    pending: 'pending',
    paid: 'paid',
    making: 'making',
    ready: 'ready',
    completed: 'completed',
    cancelled: 'cancelled',
    refunded: 'refunded',
  },
  PaymentMethod: { UBEREATS: 'UBEREATS' },
}));

import { OrderIngestionService } from './order-ingestion.service';

describe('OrderIngestionService', () => {
  const input = {
    channel: 'ubereats',
    paymentMethod: 'UBEREATS',
    clientRequestId: 'UBER:1',
    status: 'pending',
    paidAt: new Date('2026-01-01T00:00:00Z'),
    fulfillmentType: 'pickup',
    amounts: {
      subtotalCents: 1000,
      subtotalAfterDiscountCents: 1000,
      couponDiscountCents: 0,
      taxCents: 130,
      deliveryFeeCents: 0,
      totalCents: 1130,
      paymentTotalCents: 1130,
    },
    contact: { name: null },
    externalSnapshot: {},
    items: [
      {
        productStableId: 'dish',
        quantity: 1,
        displayName: 'Dish',
        unitPriceCents: 1000,
      },
    ],
  } as never;
  const policies = {
    verifyWebPayment: false,
    applyMembershipPoints: false,
    applyCoupons: false,
    persistExternalSnapshot: true,
    emitPaidLifecycleEvent: false,
  };

  it('重复接入替换菜品但只保留一个订单', async () => {
    let existing: null | {
      id: string;
      orderStableId: string;
      status: string;
      pickupCode: null;
    } = null;
    const tx = {
      order: {
        findUnique: jest.fn(() => existing),
        create: jest.fn(
          () =>
            (existing = {
              id: 'o1',
              orderStableId: 's1',
              status: 'pending',
              pickupCode: null,
            }),
        ),
        update: jest.fn(() => existing),
        updateMany: jest.fn(),
      },
      orderItem: {
        deleteMany: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'i1' }),
      },
      uberOrderItemModifier: { createMany: jest.fn() },
    };
    const prisma = {
      $transaction: (fn: (client: unknown) => unknown) => fn(tx),
    };
    const service = new OrderIngestionService(prisma as never, {} as never);
    await service.ingest(input, policies);
    await service.ingest(input, policies);
    expect(tx.order.create).toHaveBeenCalledTimes(1);
    expect(tx.order.update).toHaveBeenCalledTimes(1);
    expect(tx.orderItem.deleteMany).toHaveBeenCalledTimes(2);
  });

  it('persists scheduled timing separately from external estimated ready time', async () => {
    const scheduledReadyAt = new Date('2026-08-19T22:30:00.000Z');
    const externalEstimatedReadyAt = new Date('2026-08-19T22:26:00.000Z');
    const create = jest.fn().mockImplementation(({ data }) => ({
      ...data,
      id: 'o1',
      orderStableId: 's1',
      status: 'pending',
    }));
    const tx = {
      order: { findUnique: jest.fn().mockResolvedValue(null), create },
      orderItem: {
        deleteMany: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'i1' }),
      },
      uberOrderItemModifier: { createMany: jest.fn() },
    };
    const service = new OrderIngestionService(
      {
        $transaction: (fn: (client: unknown) => unknown) => fn(tx),
      } as never,
      {} as never,
    );

    await service.ingest(
      {
        ...(input as object),
        fulfillmentTiming: 'SCHEDULED',
        scheduledReadyAt,
        externalSnapshot: { estimatedReadyAt: externalEstimatedReadyAt },
        amounts: {
          subtotalCents: 2_500,
          subtotalAfterDiscountCents: 2_500,
          couponDiscountCents: 0,
          taxCents: 325,
          deliveryFeeCents: 0,
          totalCents: 2_500,
          paymentTotalCents: 2_500,
        },
      } as never,
      policies,
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fulfillmentTiming: 'SCHEDULED',
        scheduledReadyAt,
        prepDurationMinutes: 20,
        prepStartAt: new Date('2026-08-19T22:10:00.000Z'),
        externalEstimatedReadyAt,
      }) as unknown,
    });
  });

  it('rejects a scheduled order without a stable scheduledReadyAt', async () => {
    const service = new OrderIngestionService({} as never, {} as never);
    await expect(
      service.ingest(
        {
          ...(input as object),
          fulfillmentTiming: 'SCHEDULED',
          scheduledReadyAt: null,
        } as never,
        policies,
      ),
    ).rejects.toThrow('Scheduled orders require scheduledReadyAt');
  });

  it('显式映射 modifier 的持久化字段', async () => {
    type ModifierCreateManyArgs = {
      data: Array<{
        externalModifierId: string | null;
        parentExternalId: string | null;
        snapshot: unknown;
        sortOrder: number;
        externalId?: string;
      }>;
    };
    let createManyArgs: ModifierCreateManyArgs | undefined;
    const createMany = jest.fn((args: ModifierCreateManyArgs) => {
      createManyArgs = args;
    });
    const tx = {
      order: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'o1',
          orderStableId: 's1',
          status: 'pending',
        }),
      },
      orderItem: {
        deleteMany: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'i1' }),
      },
      uberOrderItemModifier: { createMany },
    };
    const prisma = {
      $transaction: (fn: (client: unknown) => unknown) => fn(tx),
    };
    const service = new OrderIngestionService(prisma as never, {} as never);
    const snapshot = { source: 'uber', nested: { value: 1 } };
    const modifierInput = {
      ...input,
      items: [
        {
          productStableId: 'dish',
          quantity: 1,
          displayName: 'Dish',
          unitPriceCents: 1000,
          external: {
            modifiers: [
              {
                externalId: 'modifier-1',
                parentExternalId: 'parent-1',
                displayName: 'Extra cheese',
                quantity: 2,
                priceDeltaCents: 150,
                specialInstructions: 'On the side',
                snapshot,
              },
            ],
          },
        },
      ],
    } as never;

    await service.ingest(modifierInput, policies);

    expect(createManyArgs).toBeDefined();
    const data = createManyArgs!.data;
    expect(data[0].externalModifierId).toBe('modifier-1');
    expect(data[0]).not.toHaveProperty('externalId');
    expect(data[0].parentExternalId).toBe('parent-1');
    expect(data[0].snapshot).toBe(snapshot);
    expect(data[0].sortOrder).toBe(0);
  });

  it('不会把 Web 支付校验套用到 Uber 订单', async () => {
    const service = new OrderIngestionService({} as never, {} as never);
    await expect(
      service.ingest(input, { ...policies, verifyWebPayment: true }),
    ).rejects.toThrow('only be enabled for web orders');
  });

  it('并发接单状态更新只发出一次 accepted', async () => {
    const bus = { emitOrderAccepted: jest.fn() };
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'o1',
          orderStableId: 's1',
          status: 'pending',
          paidAt: new Date(),
        }),
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
      },
    };
    const service = new OrderIngestionService(prisma as never, bus as never);
    await service.markAccepted('UBER:1');
    await service.markAccepted('UBER:1');
    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'o1',
          status: { in: ['pending', 'paid'] },
        },
      }),
    );
    expect(bus.emitOrderAccepted).toHaveBeenCalledTimes(1);
  });

  it('POS 并发推进到 paid 后仍可原子接单且只发一次 accepted', async () => {
    const bus = { emitOrderAccepted: jest.fn() };
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'o1',
          orderStableId: 's1',
          status: 'paid',
          paidAt: new Date('2026-01-01T00:00:00Z'),
        }),
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
      },
    };
    const service = new OrderIngestionService(prisma as never, bus as never);

    await Promise.all([
      service.markAccepted('UBER:1'),
      service.markAccepted('UBER:1'),
    ]);

    expect(bus.emitOrderAccepted).toHaveBeenCalledTimes(1);
  });
});
