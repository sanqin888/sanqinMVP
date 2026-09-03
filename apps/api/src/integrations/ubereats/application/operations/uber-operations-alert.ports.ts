export interface UberOperationsAlertRepositoryPort {
  getStoreStatusSource(storeStableId: string): Promise<{
    isTemporarilyClosed: boolean;
    temporaryCloseReason: string | null;
  }>;
  recordStoreStatusResult(
    result: Record<string, unknown>,
    payload: Record<string, string>,
  ): Promise<void>;
  createStoreStatusAlert(input: {
    storeStableId: string;
    uberStoreId: string;
    error: string;
    reason: 'UPSTREAM_REJECTED' | 'UPSTREAM_UNAVAILABLE';
    retryable: boolean;
    payload: Record<string, string>;
  }): Promise<void>;
}

export const UBER_OPERATIONS_ALERT_REPOSITORY = Symbol(
  'UBER_OPERATIONS_ALERT_REPOSITORY',
);
