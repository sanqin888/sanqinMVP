import { withRequiredOrderExpansions } from './uber-order-detail.gateway';

describe('Uber order detail v1 expansion', () => {
  it('adds carts and payment expansion for v1 Order Fulfillment details', () => {
    expect(withRequiredOrderExpansions('/v1/delivery/order/order-1')).toBe(
      '/v1/delivery/order/order-1?expand=carts%2Cpayment',
    );
  });

  it('preserves existing expansions and does not rewrite legacy v2 paths', () => {
    expect(
      withRequiredOrderExpansions(
        '/v1/delivery/order/order-1?expand=store,carts',
      ),
    ).toBe('/v1/delivery/order/order-1?expand=store%2Ccarts%2Cpayment');
    expect(withRequiredOrderExpansions('/v2/eats/order/order-1')).toBe(
      '/v2/eats/order/order-1',
    );
  });
});
