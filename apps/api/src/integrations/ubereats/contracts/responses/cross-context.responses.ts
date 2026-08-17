/** Public, business-facing results shared with contexts outside Uber Eats. */
export type UberEatsSyncError = {
  code: 'UPSTREAM_REJECTED' | 'UPSTREAM_UNAVAILABLE' | 'UNKNOWN';
  message: string;
  retryable: boolean;
};

export type UberEatsAvailabilitySyncStatus =
  | 'SYNCED'
  | 'SYNC_REQUESTED'
  | 'SKIPPED_NOT_PUBLISHED'
  | 'FAILED';

export type UberEatsAvailabilitySyncResult = {
  status: UberEatsAvailabilitySyncStatus;
  stores: Array<{
    storeId: string;
    status: UberEatsAvailabilitySyncStatus;
    error?: UberEatsSyncError;
  }>;
};

export type UberEatsOrderActionResult = {
  ok: boolean;
  actionId: string;
  status: 'QUEUED' | 'SUCCEEDED' | 'FAILED';
  retryable: boolean;
  error?: UberEatsSyncError;
};

export type UberEatsOrderStatusSyncResult =
  | { ok: true; actionResult: UberEatsOrderActionResult }
  | { ok: false; error: UberEatsSyncError };

export type UberEatsStoreStatusSyncResult =
  | { outcome: 'SUCCEEDED'; synchronizedStores: number }
  | {
      outcome: 'SKIPPED';
      reason: 'NO_STORES' | 'NO_PROVISIONED_STORES';
    }
  | {
      outcome: 'FAILED';
      synchronizedStores: number;
      failedStores: number;
      error: UberEatsSyncError;
    };
