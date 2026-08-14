import { OrderStatus } from './orders.requests';

describe('Uber Eats order request contracts', () => {
  it('publishes stable order status values without leaking persistence enums', () => {
    expect(Object.values(OrderStatus)).toEqual([
      'pending',
      'paid',
      'making',
      'ready',
      'completed',
      'refunded',
    ]);
  });
});
