import { UberOrderActionPrismaAdapter } from './uber-order-action-prisma.adapter';
import { UberOrderImportPrismaAdapter } from './uber-order-import-prisma.adapter';

describe('Uber scheduled finalize persistence', () => {
  it('reopens a completed ACCEPT with the finalization phase idempotency key', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'accept-task-1',
      idempotencyKey: 'initial-accept-key',
      status: 'SUCCEEDED',
    });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const adapter = new UberOrderActionPrismaAdapter({
      uberOrderAction: { findUnique, updateMany },
    } as never);

    await expect(
      adapter.requeue({
        externalOrderId: 'scheduled-order-1',
        action: 'ACCEPT',
        idempotencyKey: 'scheduled-finalize-key',
        businessVersion: 'v1',
        reasonCode: null,
        reasonDetail: null,
      }),
    ).resolves.toEqual({ taskId: 'accept-task-1', created: true });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'accept-task-1',
          idempotencyKey: 'initial-accept-key',
        }) as unknown,
        data: expect.objectContaining({
          idempotencyKey: 'scheduled-finalize-key',
          status: 'PENDING',
          retryable: true,
        }) as unknown,
      }),
    );
  });

  it('reads processed webhook cursors using the receiver order prefix', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const adapter = new UberOrderImportPrismaAdapter(
      {
        order: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'order-db-1',
            status: 'paid',
            fulfillmentTiming: 'SCHEDULED',
          }),
        },
        uberWebhookInbox: { findFirst },
      } as never,
      {} as never,
    );

    await adapter.findByExternalOrderId('scheduled-order-1');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          externalOrderId: {
            in: ['scheduled-order-1', 'order:scheduled-order-1'],
          },
          status: 'PROCESSED',
        },
      }),
    );
  });

  it('resolves a replayed admission action by the stable order-action key after its phase key changed', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 0 });
    const findUniqueOrThrow = jest
      .fn()
      .mockResolvedValue({ id: 'accept-task-1' });
    const tx = {
      uberOrderAction: { createMany, findUniqueOrThrow },
    };
    const ingest = jest.fn(
      async (
        _input: unknown,
        _policies: unknown,
        withinTransaction?: (
          transaction: typeof tx,
          result: { orderId: string },
        ) => Promise<void>,
      ) => {
        await withinTransaction?.(tx, { orderId: 'order-db-1' });
        return {
          orderId: 'order-db-1',
          orderStableId: 'stable-1',
          action: 'updated',
        };
      },
    );
    const adapter = new UberOrderImportPrismaAdapter(
      {
        order: {
          findUnique: jest.fn().mockResolvedValue({
            scheduledReadyAt: new Date('2026-08-21T14:53:28.000Z'),
            prepStartAt: new Date('2026-08-21T14:43:28.000Z'),
            prepDurationMinutes: 10,
          }),
        },
      } as never,
      { ingest } as never,
    );
    const input = {
      order: {
        externalOrderId: 'scheduled-order-1',
        displayId: 'S1001',
        pickupCode: null,
        uberStoreId: 'test-store-1',
        subtotalCents: 1000,
        taxCents: 130,
        totalCents: 1130,
        discountCents: 0,
        hasPromotion: false,
        deliveryFeeCents: 0,
        fulfillmentType: 'delivery' as const,
        fulfillmentTiming: 'SCHEDULED' as const,
        scheduledReadyAt: new Date('2026-08-21T14:53:28.000Z'),
        estimatedReadyAt: new Date('2026-08-21T14:53:28.000Z'),
        specialInstructions: null,
        allergyRequest: { hasRequest: false, allergens: [] },
        items: [
          {
            externalLineId: 'line-1',
            externalItemId: 'item-1',
            stableIdHint: null,
            displayName: 'Scheduled item',
            quantity: 1,
            baseUnitPriceCents: 1000,
            optionsUnitPriceCents: 0,
            unitPriceCents: 1000,
            lineTotalCents: 1000,
            specialInstructions: null,
            modifiers: [],
          },
        ],
        contactName: null,
        contactPhone: null,
        paidAt: new Date('2026-08-21T13:55:15.000Z'),
        cancellation: null,
      },
      posStoreId: '4750_Yonge_Street',
      eventType: 'orders.scheduled.notification',
      cursor: {
        eventId: 'scheduled-event-replay',
        occurredAt: new Date('2026-08-21T13:55:15.000Z'),
        resourceVersion: null,
        sequence: null,
      },
      menuMappings: [
        {
          externalItemId: 'item-1',
          menuItemStableId: 'menu-item-1',
          expectedPriceCents: 1000,
        },
      ],
      cancellation: null,
      actionIntent: {
        externalOrderId: 'scheduled-order-1',
        action: 'ACCEPT' as const,
        idempotencyKey: 'initial-accept-key',
        businessVersion: 'v1',
        reasonCode: null,
        reasonDetail: null,
      },
      receivedAt: new Date('2026-08-21T13:55:15.000Z'),
    };

    await expect(adapter.saveImportedOrder(input)).resolves.toMatchObject({
      action: { taskId: 'accept-task-1', created: false },
    });
    expect(findUniqueOrThrow).toHaveBeenCalledWith({
      where: {
        externalOrderId_action: {
          externalOrderId: 'scheduled-order-1',
          action: 'ACCEPT',
        },
      },
      select: { id: true },
    });
  });
});
