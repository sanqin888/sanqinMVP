import { UberOrderImportPrismaAdapter } from './uber-order-import-prisma.adapter';

const parsedOrder = {
  externalOrderId: 'uber-order-1',
  displayId: '1001',
  pickupCode: '42',
  uberStoreId: 'uber-store-1',
  subtotalCents: 1_000,
  taxCents: 130,
  totalCents: 1_130,
  discountCents: 0,
  hasPromotion: false,
  deliveryFeeCents: 0,
  fulfillmentType: 'pickup' as const,
  estimatedReadyAt: null,
  specialInstructions: null,
  items: [],
  contactName: 'Guest',
  contactPhone: null,
  paidAt: new Date('2026-08-18T15:00:00.000Z'),
  cancellation: null,
};

const baseInput = {
  order: parsedOrder,
  posStoreId: '4750_Yonge_Street',
  eventType: 'orders.notification',
  cursor: {
    eventId: 'evt-order-1',
    occurredAt: new Date('2026-08-18T15:00:00.000Z'),
    resourceVersion: '1',
    sequence: 1,
  },
  menuMappings: [],
  cancellation: null,
  actionIntent: null,
  receivedAt: new Date('2026-08-18T15:00:01.000Z'),
};

type SavedResult = {
  orderId: string;
  orderStableId: string;
  status: 'pending';
  action: 'created' | 'updated';
};

const savedOrder: SavedResult = {
  orderId: 'order-db-1',
  orderStableId: 'stable-1',
  status: 'pending',
  action: 'created',
};

describe('UberOrderImportPrismaAdapter inbox ownership', () => {
  it('recovers ordering cursor from the original processed webhook envelope', async () => {
    const adapter = new UberOrderImportPrismaAdapter(
      {
        order: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'order-db-1',
            status: 'making',
          }),
        },
        uberWebhookInbox: {
          findFirst: jest.fn().mockResolvedValue({
            eventId: 'evt-raw',
            createdAt: new Date('2026-08-18T15:00:02.000Z'),
            payload: {
              event_time: '2026-08-18T15:00:00.000Z',
              resource_version: '42',
              sequence_number: '7',
            },
          }),
        },
      } as never,
      {} as never,
    );

    await expect(
      adapter.findByExternalOrderId('uber-order-1'),
    ).resolves.toEqual({
      orderId: 'order-db-1',
      status: 'making',
      cursor: {
        eventId: 'evt-raw',
        occurredAt: new Date('2026-08-18T15:00:00.000Z'),
        resourceVersion: '42',
        sequence: 7,
      },
    });
  });

  it('persists orders.failure against the existing order without requiring detail data', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'order-db-1',
      totalCents: 1_130,
    });
    const cancellationUpsert = jest.fn().mockResolvedValue({});
    const amendmentUpsert = jest.fn().mockResolvedValue({});
    const orderUpdate = jest.fn().mockResolvedValue({});
    const tx = {
      order: { findFirst, update: orderUpdate },
      uberOrderCancellation: { upsert: cancellationUpsert },
      orderAmendment: { upsert: amendmentUpsert },
    };
    const prisma = {
      $transaction: jest.fn(
        async (work: (client: typeof tx) => Promise<void>) => work(tx),
      ),
    };
    const adapter = new UberOrderImportPrismaAdapter(
      prisma as never,
      {} as never,
    );
    const occurredAt = new Date('2026-08-20T13:30:09.000Z');

    await adapter.saveExistingOrderCancellation({
      orderId: 'order-db-1',
      externalOrderId: 'uber-order-1',
      cursor: {
        eventId: 'evt-failure-1',
        occurredAt,
        resourceVersion: null,
        sequence: null,
      },
      cancellation: {
        kind: 'CANCELLED',
        cancelledBy: null,
        reasonCode: 'UBER_ORDER_FAILURE',
        reasonDetail: null,
        occurredAt,
      },
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'order-db-1',
        clientRequestId: 'ubereats:uber-order-1',
      },
      select: { id: true, totalCents: true },
    });
    expect(cancellationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: 'evt-failure-1' },
        create: expect.objectContaining({
          orderId: 'order-db-1',
          externalOrderId: 'uber-order-1',
          eventId: 'evt-failure-1',
          kind: 'CANCELLED',
          reasonCode: 'UBER_ORDER_FAILURE',
        }) as unknown,
      }),
    );
    expect(amendmentUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          orderId: 'order-db-1',
          refundCents: 1_130,
          deltaCents: -1_130,
        }) as unknown,
      }),
    );
    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id: 'order-db-1' },
      data: { status: 'refunded' },
    });
  });

  it('never marks the webhook inbox terminal inside the order import transaction', async () => {
    const inboxUpsert = jest.fn();
    const inboxUpdate = jest.fn();
    const tx = {
      uberWebhookInbox: {
        upsert: inboxUpsert,
        updateMany: inboxUpdate,
      },
    };
    const ingest = jest.fn(
      async (
        _input: unknown,
        _policies: unknown,
        withinTransaction?: (
          transaction: typeof tx,
          result: SavedResult,
        ) => Promise<void>,
      ) => {
        await withinTransaction?.(tx, savedOrder);
        return savedOrder;
      },
    );
    const adapter = new UberOrderImportPrismaAdapter(
      {} as never,
      { ingest } as never,
    );

    await expect(adapter.saveImportedOrder(baseInput)).resolves.toEqual({
      orderId: 'order-db-1',
      created: true,
      action: null,
    });

    expect(inboxUpsert).not.toHaveBeenCalled();
    expect(inboxUpdate).not.toHaveBeenCalled();
  });

  it('worker crash replay converges on the same imported action without stealing inbox lease ownership', async () => {
    const createMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const findUniqueOrThrow = jest
      .fn()
      .mockResolvedValue({ id: 'action-task-1' });
    const inboxUpsert = jest.fn();
    const inboxUpdate = jest.fn();
    const tx = {
      uberOrderAction: { createMany, findUniqueOrThrow },
      uberWebhookInbox: {
        upsert: inboxUpsert,
        updateMany: inboxUpdate,
      },
    };
    let ingestionCount = 0;
    const ingest = jest.fn(
      async (
        _input: unknown,
        _policies: unknown,
        withinTransaction?: (
          transaction: typeof tx,
          result: SavedResult,
        ) => Promise<void>,
      ) => {
        ingestionCount += 1;
        const result: SavedResult = {
          ...savedOrder,
          action: ingestionCount === 1 ? 'created' : 'updated',
        };
        await withinTransaction?.(tx, result);
        return result;
      },
    );
    const adapter = new UberOrderImportPrismaAdapter(
      {} as never,
      { ingest } as never,
    );
    const input = {
      ...baseInput,
      actionIntent: {
        externalOrderId: 'uber-order-1',
        action: 'ACCEPT' as const,
        idempotencyKey: 'uber-order-1:ACCEPT:v1',
        businessVersion: 'v1',
        reasonCode: null,
        reasonDetail: null,
      },
    };

    const first = await adapter.saveImportedOrder(input);
    const replay = await adapter.saveImportedOrder(input);

    expect(first.action).toEqual({ taskId: 'action-task-1', created: true });
    expect(replay.action).toEqual({ taskId: 'action-task-1', created: false });
    expect(createMany).toHaveBeenCalledTimes(2);
    expect(createMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(inboxUpsert).not.toHaveBeenCalled();
    expect(inboxUpdate).not.toHaveBeenCalled();
  });
});
