import { UberOrderPayloadParser } from './uber-order-payload.parser';

describe('Uber scheduled order normalization', () => {
  it('maps v1 preparation_time to SCHEDULED ready time without using delivery target', () => {
    const parsed = new UberOrderPayloadParser().parse(
      {
        order: {
          id: 'scheduled-order-1',
          status: 'SCHEDULED',
          preparation_time: {
            ready_for_pickup_time: '2026-08-19T22:10:00.000Z',
            source: 'PREDICTED_BY_UBER',
          },
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
        scheduledReadyAt: new Date('2026-08-19T22:10:00.000Z'),
        estimatedReadyAt: new Date('2026-08-19T22:10:00.000Z'),
        totalCents: 1_000,
      }),
    );
  });

  it('uses v1 preparation_time as the external estimate for immediate orders', () => {
    const parsed = new UberOrderPayloadParser().parse(
      {
        order: {
          id: 'immediate-order-1',
          status: 'CREATED',
          preparation_time: {
            ready_for_pickup_time: '2026-08-19T22:14:00.000Z',
          },
          payment: { charges: { total: { amount_e5: 1_000_000 } } },
          carts: [
            {
              items: [
                {
                  id: 'item-1',
                  title: 'Dish',
                  quantity: { amount: 1 },
                  price: { amount_e5: 1_000_000 },
                },
              ],
            },
          ],
        },
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

  it('does not treat the scheduled delivery window as kitchen ready time', () => {
    expect(
      new UberOrderPayloadParser().parseResult(
        {
          order: {
            id: 'scheduled-order-2',
            status: 'SCHEDULED',
            scheduled_order_target_delivery_time_range: {
              start_time: '2026-08-19T22:30:00.000Z',
              end_time: '2026-08-19T22:45:00.000Z',
            },
            payment: { charges: { total: { amount_e5: 1_000_000 } } },
            carts: [
              {
                items: [
                  {
                    id: 'item-1',
                    title: 'Dish',
                    quantity: { amount: 1 },
                    price: { amount_e5: 1_000_000 },
                  },
                ],
              },
            ],
          },
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
