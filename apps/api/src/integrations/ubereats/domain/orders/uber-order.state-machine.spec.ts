import { UberOrderStateMachine } from './uber-order.state-machine';

describe('UberOrderStateMachine', () => {
  it('never maps cancellation into an arbitrary local status', () => {
    expect(UberOrderStateMachine.eventStatus('orders.cancelled')).toBeNull();
    expect(UberOrderStateMachine.afterCancellation('making' as never)).toBe(
      'refunded',
    );
    expect(
      UberOrderStateMachine.afterCancellation('completed' as never),
    ).toBeNull();
  });

  it('validates commands and only advances after confirmed actions', () => {
    expect(
      UberOrderStateMachine.canRequestAction(
        'making' as never,
        'READY_FOR_PICKUP',
      ),
    ).toBe(true);
    expect(
      UberOrderStateMachine.canRequestAction(
        'completed' as never,
        'READY_FOR_PICKUP',
      ),
    ).toBe(false);
    expect(
      UberOrderStateMachine.afterConfirmedAction(
        'making' as never,
        'READY_FOR_PICKUP',
      ),
    ).toBe('ready');
  });

  it('generates a stable action key across worker retries', () => {
    const first = UberOrderStateMachine.idempotencyKey('order-1', 'ACCEPT');
    expect(first).toBe(
      UberOrderStateMachine.idempotencyKey('order-1', 'ACCEPT'),
    );
    expect(first).not.toBe(
      UberOrderStateMachine.idempotencyKey('order-1', 'DENY'),
    );
  });
});
