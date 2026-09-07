jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  Channel: { web: 'web', in_store: 'in_store', ubereats: 'ubereats' },
  OrderFulfillmentTiming: { IMMEDIATE: 'IMMEDIATE', SCHEDULED: 'SCHEDULED' },
  OrderStatus: {
    pending: 'pending',
    paid: 'paid',
    making: 'making',
    ready: 'ready',
    completed: 'completed',
    refunded: 'refunded',
  },
}));

import { OrderPreparationService } from './order-preparation.service';

type RawTag = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;

type CapturedTag = {
  tag: RawTag;
  getStrings: () => TemplateStringsArray | null;
  getValues: () => unknown[];
};

const captureTag = (rows: unknown[]): CapturedTag => {
  let strings: TemplateStringsArray | null = null;
  let values: unknown[] = [];
  return {
    tag: (input, ...interpolations) => {
      strings = input;
      values = interpolations;
      return Promise.resolve(rows);
    },
    getStrings: () => strings,
    getValues: () => values,
  };
};

const scheduled = (status = 'paid', activatedAt: Date | null = null) => ({
  id: 'order-1',
  orderStableId: 'stable-1',
  clientRequestId: 'ubereats:external-1',
  channel: 'ubereats',
  status,
  fulfillmentTiming: 'SCHEDULED',
  scheduledReadyAt: new Date('2026-08-19T22:30:00.000Z'),
  prepStartAt: new Date('2026-08-19T22:10:00.000Z'),
  scheduleActivatedAt: activatedAt,
});

const sqlText = (strings: TemplateStringsArray) => strings.join('?');

describe('OrderPreparationService', () => {
  it('activates a scheduled order and appends prep_started in the same transaction', async () => {
    const now = new Date('2026-08-19T22:10:03.000Z');
    const query = captureTag([scheduled()]);
    const update = jest.fn().mockResolvedValue({});
    const findFirst = jest.fn().mockResolvedValue({ id: 'accepted-event' });
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: query.tag,
      order: { update },
      opsEvent: { findFirst, createMany },
    };
    const service = new OrderPreparationService({
      $transaction: (work: (client: unknown) => unknown) => work(tx),
    } as never);

    await expect(
      service.activateScheduledOrder('order-1', now),
    ).resolves.toEqual(
      expect.objectContaining({ outcome: 'activated', status: 'making' }),
    );

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        source: 'orders.lifecycle',
        eventName: 'order.accepted',
        payload: { path: ['orderStableId'], equals: 'stable-1' },
      },
      select: { id: true },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: {
        status: 'making',
        makingAt: now,
        scheduleActivatedAt: now,
      },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: {
        idempotencyKey: 'order.prep_started:stable-1',
        eventName: 'order.prep_started',
        source: 'orders.lifecycle',
        payload: { orderStableId: 'stable-1' },
      },
      skipDuplicates: true,
    });
  });

  it('does not activate a scheduled order before the durable accepted fact exists', async () => {
    const query = captureTag([scheduled()]);
    const update = jest.fn();
    const findFirst = jest.fn().mockResolvedValue(null);
    const createMany = jest.fn();
    const tx = {
      $queryRaw: query.tag,
      order: { update },
      opsEvent: { findFirst, createMany },
    };
    const service = new OrderPreparationService({
      $transaction: (work: (client: unknown) => unknown) => work(tx),
    } as never);

    await expect(service.activateScheduledOrder('order-1')).resolves.toEqual(
      expect.objectContaining({ outcome: 'skipped', status: 'paid' }),
    );
    expect(update).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('is idempotent when the order is already making', async () => {
    const query = captureTag([
      scheduled('making', new Date('2026-08-19T22:10:00.000Z')),
    ]);
    const update = jest.fn();
    const createMany = jest.fn();
    const tx = {
      $queryRaw: query.tag,
      order: { update },
      opsEvent: { createMany },
    };
    const service = new OrderPreparationService({
      $transaction: (work: (client: unknown) => unknown) => work(tx),
    } as never);

    await expect(service.activateScheduledOrder('order-1')).resolves.toEqual(
      expect.objectContaining({ outcome: 'already_active', status: 'making' }),
    );
    expect(update).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('claims only due, unactivated, accepted, producible scheduled orders with SKIP LOCKED', async () => {
    const query = captureTag([]);
    const service = new OrderPreparationService({
      $transaction: (work: (client: unknown) => unknown) =>
        work({ $queryRaw: query.tag }),
    } as never);

    await expect(
      service.activateNextDueScheduledOrder(
        new Date('2026-08-19T22:10:00.000Z'),
      ),
    ).resolves.toBe(false);

    const strings = query.getStrings();
    if (!strings) throw new Error('expected scheduler query');
    const statement = sqlText(strings);
    expect(statement).toContain('"fulfillmentTiming" = \'SCHEDULED\'');
    expect(statement).toContain('"scheduleActivatedAt" IS NULL');
    expect(statement).toContain('"prepStartAt" <=');
    expect(statement).toContain("orders.status IN ('pending'");
    expect(statement).toContain('"eventName" =');
    expect(statement).toContain('FOR UPDATE OF orders SKIP LOCKED');
    expect(query.getValues()).toContain('order.accepted');
  });

  it('skips cancelled/refunded or otherwise non-producible states during explicit activation', async () => {
    const query = captureTag([scheduled('refunded')]);
    const update = jest.fn();
    const createMany = jest.fn();
    const tx = {
      $queryRaw: query.tag,
      order: { update },
      opsEvent: { createMany },
    };
    const service = new OrderPreparationService({
      $transaction: (work: (client: unknown) => unknown) => work(tx),
    } as never);

    await expect(service.activateScheduledOrder('order-1')).resolves.toEqual(
      expect.objectContaining({ outcome: 'skipped', status: 'refunded' }),
    );
    expect(update).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('records immediate Web acceptance durably and leaves prep to the lifecycle consumer', async () => {
    const query = captureTag([
      {
        id: 'web-order-1',
        orderStableId: 'web-stable-1',
        clientRequestId: 'SQW2609060001',
        channel: 'web',
        status: 'paid',
        fulfillmentTiming: 'IMMEDIATE',
        scheduledReadyAt: null,
        prepStartAt: null,
        scheduleActivatedAt: null,
      },
    ]);
    const update = jest.fn();
    const findFirst = jest.fn();
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: query.tag,
      order: { update },
      opsEvent: { findFirst, createMany },
    };
    const service = new OrderPreparationService({
      $transaction: (work: (client: unknown) => unknown) => work(tx),
    } as never);

    await expect(
      service.acceptWebOrderByStableId('web-stable-1', '4750_Yonge_Street'),
    ).resolves.toBe('IMMEDIATE');

    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith({
      data: {
        idempotencyKey: 'order.accepted:web-stable-1',
        eventName: 'order.accepted',
        source: 'orders.lifecycle',
        payload: { orderStableId: 'web-stable-1' },
      },
      skipDuplicates: true,
    });
    expect(update).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('accepts a scheduled Web order without starting prep before prepStartAt', async () => {
    const query = captureTag([
      {
        id: 'web-order-scheduled',
        orderStableId: 'web-stable-scheduled',
        clientRequestId: 'SQW2609060002',
        channel: 'web',
        status: 'paid',
        fulfillmentTiming: 'SCHEDULED',
        scheduledReadyAt: new Date('2026-09-06T18:30:00.000Z'),
        prepStartAt: new Date('2026-09-06T18:10:00.000Z'),
        scheduleActivatedAt: null,
      },
    ]);
    const update = jest.fn();
    const findFirst = jest.fn();
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: query.tag,
      order: { update },
      opsEvent: { findFirst, createMany },
    };
    const service = new OrderPreparationService({
      $transaction: (work: (client: unknown) => unknown) => work(tx),
    } as never);

    await expect(
      service.acceptWebOrderByStableId(
        'web-stable-scheduled',
        '4750_Yonge_Street',
      ),
    ).resolves.toBe('SCHEDULED');

    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith({
      data: {
        idempotencyKey: 'order.accepted:web-stable-scheduled',
        eventName: 'order.accepted',
        source: 'orders.lifecycle',
        payload: { orderStableId: 'web-stable-scheduled' },
      },
      skipDuplicates: true,
    });
    expect(update).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('does not let the Web acceptance command synthesize acceptance for another channel', async () => {
    const query = captureTag([
      {
        id: 'pos-order-1',
        orderStableId: 'pos-stable-1',
        clientRequestId: 'SQP2609060001',
        channel: 'in_store',
        status: 'paid',
        fulfillmentTiming: 'IMMEDIATE',
        scheduledReadyAt: null,
        prepStartAt: null,
        scheduleActivatedAt: null,
      },
    ]);
    const createMany = jest.fn();
    const service = new OrderPreparationService({
      $transaction: (work: (client: unknown) => unknown) =>
        work({ $queryRaw: query.tag, opsEvent: { createMany } }),
    } as never);

    await expect(
      service.acceptWebOrderByStableId('pos-stable-1', '4750_Yonge_Street'),
    ).resolves.toBeNull();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('store-scoped immediate activation uses the accepted durable fact and writes prep_started', async () => {
    const now = new Date('2026-09-05T22:55:00.000Z');
    const query = captureTag([
      {
        id: 'order-1',
        orderStableId: 'stable-1',
        clientRequestId: 'SQP2609050001',
        channel: 'in_store',
        status: 'paid',
        fulfillmentTiming: 'IMMEDIATE',
        scheduledReadyAt: null,
        prepStartAt: null,
        scheduleActivatedAt: null,
      },
    ]);
    const update = jest.fn().mockResolvedValue({});
    const findFirst = jest.fn().mockResolvedValue({ id: 'accepted-event' });
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: query.tag,
      order: { update },
      opsEvent: { findFirst, createMany },
    };
    const service = new OrderPreparationService({
      $transaction: (work: (client: unknown) => unknown) => work(tx),
    } as never);

    await expect(
      service.activateAcceptedImmediateOrderByStableId(
        'stable-1',
        '4750_Yonge_Street',
        now,
      ),
    ).resolves.toEqual(
      expect.objectContaining({ outcome: 'activated', status: 'making' }),
    );

    expect(query.getValues()).toEqual(['stable-1', '4750_Yonge_Street']);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        source: 'orders.lifecycle',
        eventName: 'order.accepted',
        payload: { path: ['orderStableId'], equals: 'stable-1' },
      },
      select: { id: true },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { status: 'making', makingAt: now },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: {
        idempotencyKey: 'order.prep_started:stable-1',
        eventName: 'order.prep_started',
        source: 'orders.lifecycle',
        payload: { orderStableId: 'stable-1' },
      },
      skipDuplicates: true,
    });
  });

  it('store-scoped activation matches only the canonical storeId', async () => {
    const query = captureTag([]);
    const service = new OrderPreparationService({
      $transaction: (work: (client: unknown) => unknown) =>
        work({ $queryRaw: query.tag }),
    } as never);

    await service.activateScheduledOrderByStableId(
      'stable-1',
      '4750_Yonge_Street',
    );

    const strings = query.getStrings();
    if (!strings) throw new Error('expected store-scoped activation query');
    const statement = sqlText(strings);
    expect(statement).toContain('"storeId" =');
    expect(statement).not.toContain('"storeId" IS NULL');
    expect(query.getValues()).toEqual(['stable-1', '4750_Yonge_Street']);
  });
});
