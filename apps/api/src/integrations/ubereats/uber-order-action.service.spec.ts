import { UberOrderActionService } from './uber-order-action.service';

const service = new UberOrderActionService(
  {} as never,
  {} as never,
  { apiBaseUrl: 'https://api.uber.com' } as never,
);

describe('UberOrderActionService', () => {
  it.each([
    ['ACCEPT', '/v1/eats/orders/order%2F1/accept_pos_order'],
    ['DENY', '/v1/eats/orders/order%2F1/deny_pos_order'],
    ['READY_FOR_PICKUP', '/v1/delivery/order/order%2F1/ready'],
  ] as const)('maps %s to its HTTP endpoint', (action, path) => {
    expect(service.buildPath('order/1', action)).toBe(path);
  });

  it('classifies retryable failures and idempotent ready conflicts', () => {
    expect(
      service.classify('ACCEPT', { ok: false, status: 503 } as Response),
    ).toEqual({ succeeded: false, retryable: true });
    expect(
      service.classify('READY_FOR_PICKUP', {
        ok: false,
        status: 409,
      } as Response),
    ).toEqual({ succeeded: true, retryable: false });
  });
});
