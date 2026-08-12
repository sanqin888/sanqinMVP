import type {
  UberEatsAvailabilitySyncResult,
  UberEatsOrderActionResult,
  UberEatsStoreStatusSyncResult,
} from '../../public-api';

describe('Uber Eats cross-context contracts', () => {
  it('locks required fields, enums, and structured error semantics at compile time', () => {
    const availability = {
      status: 'SYNC_REQUESTED',
      stores: [{ storeId: 'store-1', status: 'SYNC_REQUESTED' }],
    } satisfies UberEatsAvailabilitySyncResult;
    const action = {
      ok: false,
      actionId: 'action-1',
      status: 'FAILED',
      retryable: true,
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'timeout',
        retryable: true,
      },
    } satisfies UberEatsOrderActionResult;
    const skipped = {
      outcome: 'SKIPPED',
      reason: 'NO_PROVISIONED_STORES',
    } satisfies UberEatsStoreStatusSyncResult;

    // @ts-expect-error persistence status is not part of the public contract
    const persistenceStatus: UberEatsOrderActionResult = { status: 'PENDING' };
    // @ts-expect-error failures must carry structured error semantics
    const incompleteFailure: UberEatsStoreStatusSyncResult = {
      outcome: 'FAILED',
    };

    expect([availability, action, skipped]).toHaveLength(3);
    expect(persistenceStatus).toBeDefined();
    expect(incompleteFailure).toBeDefined();
  });
});
