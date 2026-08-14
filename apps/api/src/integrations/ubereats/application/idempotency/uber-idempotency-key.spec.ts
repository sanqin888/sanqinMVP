import { buildUberIdempotencyKey } from './uber-idempotency-key';

describe('buildUberIdempotencyKey', () => {
  const task = {
    taskId: 'publish-task-1',
    resourceId: 'store-1',
    action: 'PUBLISH_MENU',
  };

  it('is stable for a reclaimed task and changes with business version', () => {
    const first = buildUberIdempotencyKey({ ...task, businessVersion: 'v1' });
    expect(buildUberIdempotencyKey({ ...task, businessVersion: 'v1' })).toBe(
      first,
    );
    expect(
      buildUberIdempotencyKey({ ...task, businessVersion: 'v2' }),
    ).not.toBe(first);
  });
});
