import type {
  UberEatsAvailabilitySyncResult,
  UberEatsAvailabilitySyncStatus,
  UberEatsOrderActionResult,
  UberEatsSyncError,
} from '../../public-api';
import type {
  UberAvailabilitySyncResult,
  UberAvailabilitySyncStatus,
} from '../../domain/menu/uber-menu.types';

export const publicSyncError = (
  message: string,
  retryable = true,
): UberEatsSyncError => ({ code: 'UNKNOWN', message, retryable });

const presentAvailabilityStatus = (
  status: UberAvailabilitySyncStatus,
): UberEatsAvailabilitySyncStatus =>
  status === 'PENDING' ? 'SYNC_REQUESTED' : status;

export const presentAvailabilitySync = (
  result: UberAvailabilitySyncResult,
): UberEatsAvailabilitySyncResult => ({
  status: presentAvailabilityStatus(result.status),
  stores: result.stores.map((store) => ({
    storeId: store.storeId,
    status: presentAvailabilityStatus(store.status),
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
