import type {
  UberEatsAvailabilitySyncResult,
  UberEatsOrderActionResult,
  UberEatsSyncError,
} from '../public-api';

export const publicSyncError = (
  message: string,
  retryable = true,
): UberEatsSyncError => ({ code: 'UNKNOWN', message, retryable });

export const presentAvailabilitySync = (result: {
  status: 'PENDING' | 'FAILED' | 'SKIPPED_NOT_PUBLISHED';
  stores: Array<{
    storeId: string;
    status: 'PENDING' | 'FAILED' | 'SKIPPED_NOT_PUBLISHED';
    error?: string;
  }>;
}): UberEatsAvailabilitySyncResult => ({
  status: result.status === 'PENDING' ? 'SYNC_REQUESTED' : result.status,
  stores: result.stores.map((store) => ({
    storeId: store.storeId,
    status: store.status === 'PENDING' ? 'SYNC_REQUESTED' : store.status,
    ...(store.error ? { error: publicSyncError(store.error) } : {}),
  })),
});

export const presentOrderAction = (result: {
  ok: boolean;
  id?: string;
  actionId?: string;
  status: string;
  retryable: boolean;
  lastError?: string | null;
}): UberEatsOrderActionResult => ({
  ok: result.ok,
  actionId: result.actionId ?? result.id ?? '',
  status:
    result.status === 'SUCCEEDED'
      ? 'SUCCEEDED'
      : result.status === 'FAILED'
        ? 'FAILED'
        : 'QUEUED',
  retryable: result.retryable,
  ...(result.lastError
    ? { error: publicSyncError(result.lastError, result.retryable) }
    : {}),
});
