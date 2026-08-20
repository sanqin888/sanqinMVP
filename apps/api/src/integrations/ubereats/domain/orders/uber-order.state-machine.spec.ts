import { UberOrderStateMachine } from './uber-order.state-machine';

describe('UberOrderStateMachine', () => {
  it('keeps cancellation as an explicit lifecycle decision', () => {
    expect(UberOrderStateMachine.afterCancellation('making' as never)).toBe(
      'refunded',
    );
    expect(
      UberOrderStateMachine.afterCancellation('completed' as never),
    ).toBeNull();
    expect(
      UberOrderStateMachine.afterConfirmedAction('making' as never, 'CANCEL'),
    ).toBe('refunded');
  });

  it('treats ACCEPT as acceptance only, not preparation start', () => {
    expect(
      UberOrderStateMachine.afterConfirmedAction('pending' as never, 'ACCEPT'),
    ).toBe('paid');
    expect(
      UberOrderStateMachine.afterConfirmedAction('paid' as never, 'ACCEPT'),
    ).toBe('paid');
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

  it('rejects stale events and illegal status regressions', () => {
    expect(
      UberOrderStateMachine.acceptsEvent({
        currentStatus: 'ready' as never,
        nextStatus: 'making' as never,
      }),
    ).toBe(false);
    expect(
      UberOrderStateMachine.acceptsEvent({
        currentStatus: 'making' as never,
        nextStatus: 'ready' as never,
        currentUpdatedAt: new Date('2026-08-10T12:00:00Z'),
        eventOccurredAt: new Date('2026-08-10T11:59:59Z'),
      }),
    ).toBe(false);
  });
});
