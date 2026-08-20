import {
  withRequiredOrderExpansions,
  withScheduledOrderExpansions,
} from './uber-order-detail.gateway';

describe('Uber Order Fulfillment 1.0.0 detail expansion', () => {
  it('adds carts and payment expansions', () => {
    expect(withRequiredOrderExpansions('/v1/delivery/order/order-1')).toBe(
      '/v1/delivery/order/order-1?expand=carts%2Cpayment',
    );
  });

  it('adds deliveries only for scheduled order detail reads', () => {
    expect(withScheduledOrderExpansions('/v1/delivery/order/order-1')).toBe(
      '/v1/delivery/order/order-1?expand=carts%2Cpayment%2Cdeliveries',
    );
  });

  it('preserves other official expansions while ensuring required ones', () => {
    expect(
      withRequiredOrderExpansions(
        '/v1/delivery/order/order-1?expand=deliveries,carts',
      ),
    ).toBe('/v1/delivery/order/order-1?expand=deliveries%2Ccarts%2Cpayment');
  });

  it('rejects non Order Fulfillment detail paths', () => {
    expect(() => withRequiredOrderExpansions('/v1/unknown/order-1')).toThrow(
      'Order Fulfillment API 1.0.0',
    );
  });
});
