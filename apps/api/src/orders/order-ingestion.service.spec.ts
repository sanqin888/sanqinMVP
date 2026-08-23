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

import { Logger } from '@nestjs/common';
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

  afterEach(() => {
    jest.restoreAllMocks();
  });

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
    const create = jest.fn((args: { data: Record<string, unknown> }) => ({
      ...args.data,
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

  it('logs when a new scheduled order first becomes eligible for the reservation board', async () => {
    const scheduledReadyAt = new Date('2026-08-19T22:30:00.000Z');
    const loggerLogSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
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
        externalOrderId: 'uber-order-1',
        fulfillmentTiming: 'SCHEDULED',
        scheduledReadyAt,
      } as never,
      policies,
    );

    expect(loggerLogSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'scheduled_order_board_queued',
        orderStableId: 's1',
        externalOrderId: 'uber-order-1',
        channel: 'ubereats',
        status: 'pending',
        scheduledReadyAt: scheduledReadyAt.toISOString(),
      }),
    );
  });

  it('does not log reservation-board entry again when a scheduled order is updated', async () => {
    const scheduledReadyAt = new Date('2026-08-19T22:30:00.000Z');
    const loggerLogSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const existing = {
      id: 'o1',
      orderStableId: 's1',
      status: 'pending',
      pickupCode: null,
    };
    const tx = {
      order: {
        findUnique: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue(existing),
      },
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
      } as never,
      policies,
    );

    expect(loggerLogSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'scheduled_order_board_queued' }),
    );
  });

  it('does not log reservation-board entry for immediate orders', async () => {
    const loggerLogSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
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
      uberOrderItemModifier: { createMany: jest.fn() },
    };
    const service = new OrderIngestionService(
      {
        $transaction: (fn: (client: unknown) => unknown) => fn(tx),
      } as never,
      {} as never,
    );

    await service.ingest(input, policies);

    expect(loggerLogSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'scheduled_order_board_queued' }),
    );
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
});
