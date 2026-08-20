import { orderReadScope } from './uber-order-detail.gateway';

describe('Uber order detail read scope', () => {
  it.each([
    ['/v1/delivery/order/order-1', 'eats.order'],
    ['/v1/delivery/order/order-1?expand=carts', 'eats.order'],
    ['/v2/eats/order/order-1', 'eats.store.orders.read'],
  ] as const)('maps %s to %s', (path, scope) => {
    expect(orderReadScope(path)).toBe(scope);
  });
});
