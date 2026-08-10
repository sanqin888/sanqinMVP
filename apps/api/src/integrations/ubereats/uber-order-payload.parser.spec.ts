jest.mock('@prisma/client', () => ({
  OrderStatus: {
    pending: 'pending',
    paid: 'paid',
    making: 'making',
    ready: 'ready',
    completed: 'completed',
    cancelled: 'cancelled',
    refunded: 'refunded',
  },
}));

import {
  mapUberEventTypeToOrderStatus,
  UberOrderPayloadParser,
  validateUberOrderAmounts,
} from './uber-order-payload.parser';

describe('UberOrderPayloadParser', () => {
  it('normalizes nested items, modifiers and money without infrastructure', () => {
    const order = new UberOrderPayloadParser().parse({
      id: 'uber-1',
      subtotal: 1200,
      tax: 100,
      total: 1300,
      items: [
        {
          id: 'item-1',
          quantity: 2,
          total_price: 1200,
          modifiers: [{ id: 'choice-1', price: 100 }],
        },
      ],
    });
    expect(order).toMatchObject({
      externalOrderId: 'uber-1',
      subtotalCents: 1200,
      totalCents: 1300,
    });
    expect(order?.items[0]).toMatchObject({
      quantity: 2,
      unitPriceCents: 600,
      optionsUnitPriceCents: 100,
    });
    expect(validateUberOrderAmounts(order!)).toMatchObject({
      totalVarianceCents: 0,
      hasMaterialVariance: false,
    });
  });

  it('maps lifecycle events while keeping cancellations out of local status transitions', () => {
    expect(mapUberEventTypeToOrderStatus('orders.ready')).toBe('ready');
    expect(mapUberEventTypeToOrderStatus('orders.cancelled')).toBeNull();
  });
});
