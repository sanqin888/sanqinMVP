export type CatalogExternalAvailabilitySyncError = {
  code: 'UPSTREAM_REJECTED' | 'UPSTREAM_UNAVAILABLE' | 'UNKNOWN';
  message: string;
  retryable: boolean;
};

export type CatalogExternalAvailabilitySyncStatus =
  | 'SYNCED'
  | 'SYNC_REQUESTED'
  | 'SKIPPED_NOT_PUBLISHED'
  | 'FAILED';

export type CatalogExternalAvailabilitySyncResult = {
  status: CatalogExternalAvailabilitySyncStatus;
  stores: Array<{
    storeStableId: string;
    status: CatalogExternalAvailabilitySyncStatus;
    error?: CatalogExternalAvailabilitySyncError;
  }>;
};

export interface CatalogExternalAvailabilitySyncPort {
  syncMenuItemAvailability(input: {
    menuItemStableId: string;
    isAvailable: boolean;
    publishable: boolean;
    suspendUntil: string | null;
  }): Promise<CatalogExternalAvailabilitySyncResult>;

  syncOptionAvailability(input: {
    optionChoiceStableId: string;
    isAvailable: boolean;
    suspendUntil: string | null;
  }): Promise<CatalogExternalAvailabilitySyncResult>;
}

export const CATALOG_EXTERNAL_AVAILABILITY_SYNC = Symbol(
  'CATALOG_EXTERNAL_AVAILABILITY_SYNC',
);
