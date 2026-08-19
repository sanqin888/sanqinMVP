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
    const queryRaw = jest
      .fn<ReturnType<RawTag>, Parameters<RawTag>>()
      .mockResolvedValue([scheduled()]);
    const update = jest.fn().mockResolvedValue({});
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: queryRaw,
      order: { update },
      opsEvent: { createMany },
    };
    const service = new OrderPreparationService({
      $transaction: (work: (client: unknown) => unknown) => work(tx),
    } as never);

    await expect(service.activateScheduledOrder('order-1', now)).resolves.toEqual(
      expect.objectContaining({ outcome: 'activated', status: 'making' }),
    );

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

  it('is idempotent when the order is already making', async () => {
    const update = jest.fn();
    const createMany = jest.fn();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([
        scheduled('making', new Date('2026-08-19T22:10:00.000Z')),
      ]),
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
    const queryRaw = jest
      .fn<ReturnType<RawTag>, Parameters<RawTag>>()
      .mockResolvedValue([]);
    const service = new OrderPreparationService({
      $transaction: (work: (client: unknown) => unknown) =>
        work({ $queryRaw: queryRaw }),
    } as never);

    await expect(
      service.activateNextDueScheduledOrder(
        new Date('2026-08-19T22:10:00.000Z'),
      ),
    ).resolves.toBe(false);

    const statement = sqlText(queryRaw.mock.calls[0][0]);
    expect(statement).toContain('"fulfillmentTiming" = \'SCHEDULED\'');
    expect(statement).toContain('"scheduleActivatedAt" IS NULL');
    expect(statement).toContain('"prepStartAt" <=');
    expect(statement).toContain("orders.status IN ('pending'");
    expect(statement).toContain('"eventName" =');
    expect(statement).toContain('FOR UPDATE OF orders SKIP LOCKED');
    expect(queryRaw.mock.calls[0]).toContain('order.accepted');
  });

  it('skips cancelled/refunded or otherwise non-producible states during explicit activation', async () => {
    const update = jest.fn();
    const createMany = jest.fn();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([scheduled('refunded')]),
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
