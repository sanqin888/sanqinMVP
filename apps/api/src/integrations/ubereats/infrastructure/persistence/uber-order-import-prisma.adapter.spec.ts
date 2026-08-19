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

  it('normalizes Uber modifiers into printable shared option snapshots', async () => {
    let capturedInput: unknown;
    const ingest = jest.fn((input: unknown) => {
      capturedInput = input;
      return Promise.resolve(savedOrder);
    });
    const adapter = new UberOrderImportPrismaAdapter(
      {
        uberModifierGroupConfig: {
          findMany: jest.fn().mockResolvedValue([
            {
              externalModifierGroupId: 'uber-group-spice',
              templateGroupStableId: 'group-spice',
              displayName: 'Level of Spice',
              minSelect: 1,
              maxSelect: 1,
            },
          ]),
        },
        uberOptionItemConfig: {
          findMany: jest.fn().mockResolvedValue([
            {
              externalItemId: 'uber-option-medium',
              optionChoiceStableId: 'option-medium',
              displayName: 'Medium Spicy',
            },
          ]),
        },
      } as never,
      { ingest } as never,
    );

    await adapter.saveImportedOrder({
      ...baseInput,
      menuMappings: [
        {
          externalItemId: 'uber-item-1',
          menuItemStableId: 'menu-item-1',
          expectedPriceCents: 1_000,
        },
      ],
      order: {
        ...parsedOrder,
        fulfillmentTiming: 'IMMEDIATE' as const,
        scheduledReadyAt: null,
        items: [
          {
            externalLineId: 'line-1',
            externalItemId: 'uber-item-1',
            stableIdHint: null,
            displayName: 'SanQ Noodles',
            quantity: 1,
            baseUnitPriceCents: 1_000,
            optionsUnitPriceCents: 0,
            unitPriceCents: 1_000,
            lineTotalCents: 1_000,
            specialInstructions: 'no cilantro',
            modifiers: [
              {
                externalId: 'uber-option-medium',
                parentExternalId: 'uber-group-spice',
                displayName: 'Medium Spicy',
                quantity: 1,
                priceDeltaCents: 0,
                specialInstructions: null,
                children: [],
              },
            ],
          },
        ],
      },
    });

    expect(capturedInput).toMatchObject({
      items: [
        {
          productStableId: 'menu-item-1',
          external: { instructions: 'no cilantro' },
          options: [
            {
              templateGroupStableId: 'group-spice',
              displayName: 'Level of Spice',
              minSelect: 1,
              maxSelect: 1,
              choices: [
                {
                  stableId: 'option-medium',
                  templateGroupStableId: 'group-spice',
                  displayName: 'Medium Spicy',
                  priceDeltaCents: 0,
                },
              ],
            },
          ],
        },
      ],
    });
  });
});
