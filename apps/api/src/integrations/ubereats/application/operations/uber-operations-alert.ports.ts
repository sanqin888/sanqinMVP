export interface UberOperationsAlertRepositoryPort {
  getStoreStatusSource(): Promise<{
    isTemporarilyClosed: boolean;
    temporaryCloseReason: string | null;
  }>;
  recordStoreStatusResult(
    result: Record<string, unknown>,
    payload: Record<string, string>,
  ): Promise<void>;
  createStoreStatusAlert(
    uberStoreId: string,
    error: string,
    status: number,
    payload: Record<string, string>,
  ): Promise<void>;
}

export const UBER_OPERATIONS_ALERT_REPOSITORY = Symbol(
  'UBER_OPERATIONS_ALERT_REPOSITORY',
);
