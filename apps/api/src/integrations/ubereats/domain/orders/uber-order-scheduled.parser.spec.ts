import { UberOrderPayloadParser } from './uber-order-payload.parser';

describe('Uber scheduled order normalization', () => {
  it('maps v1 scheduled notification detail to SCHEDULED with a stable target time', () => {
    const parsed = new UberOrderPayloadParser().parse(
      {
        order: {
          id: 'scheduled-order-1',
          status: 'SCHEDULED',
          scheduled_order_target_delivery_time_range: {
            start_time: '2026-08-19T22:30:00.000Z',
            end_time: '2026-08-19T22:45:00.000Z',
          },
          store: { id: 'uber-store-1' },
          carts: [
            {
              items: [
                {
                  id: 'item-1',
                  title: 'Roujiamo',
                  quantity: { amount: 1 },
                  price: { amount_e5: 1_000_000 },
                },
              ],
            },
          ],
          payment: { charges: { total: { amount_e5: 1_000_000 } } },
        },
      },
      { eventType: 'orders.scheduled.notification' },
    );

    expect(parsed).toEqual(
      expect.objectContaining({
        externalOrderId: 'scheduled-order-1',
        fulfillmentTiming: 'SCHEDULED',
        scheduledReadyAt: new Date('2026-08-19T22:30:00.000Z'),
        estimatedReadyAt: null,
        totalCents: 1_000,
      }),
    );
  });

  it('keeps an immediate order IMMEDIATE and its external estimate separate', () => {
    const parsed = new UberOrderPayloadParser().parse(
      {
        id: 'immediate-order-1',
        total: 1_000,
        estimated_ready_for_pickup_at: '2026-08-19T22:14:00.000Z',
        items: [{ id: 'item-1', title: 'Dish', quantity: 1, price: 1_000 }],
      },
      { eventType: 'orders.notification' },
    );

    expect(parsed).toEqual(
      expect.objectContaining({
        fulfillmentTiming: 'IMMEDIATE',
        scheduledReadyAt: null,
        estimatedReadyAt: new Date('2026-08-19T22:14:00.000Z'),
      }),
    );
  });

  it('rejects scheduled notifications that do not contain a stable scheduled target', () => {
    expect(
      new UberOrderPayloadParser().parseResult(
        {
          id: 'scheduled-order-2',
          total: 1_000,
          estimated_ready_for_pickup_at: '2026-08-19T22:14:00.000Z',
          items: [{ id: 'item-1', title: 'Dish', quantity: 1, price: 1_000 }],
        },
        { eventType: 'orders.scheduled.notification' },
      ),
    ).toEqual({
      kind: 'invalid',
      reason: 'MISSING_SCHEDULED_READY_AT',
      category: 'mapping',
    });
  });
});
