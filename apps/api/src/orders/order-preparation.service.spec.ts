jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
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
        idempotencyKey: 'order.accepted:order-1',
        source: 'orders.lifecycle',
        eventName: 'order.accepted',
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
        idempotencyKey: 'order.prep_started:order-1',
        eventName: 'order.prep_started',
        source: 'orders.lifecycle',
        payload: { orderId: 'order-1', orderStableId: 'stable-1' },
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
});
