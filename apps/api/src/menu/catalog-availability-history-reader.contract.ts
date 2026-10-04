export const CATALOG_AVAILABILITY_HISTORY_READER = Symbol(
  'CATALOG_AVAILABILITY_HISTORY_READER',
);

export type CatalogItemUnavailableHistoryInterval = {
  menuItemStableId: string;
  nameEnSnapshot: string;
  nameZhSnapshot: string | null;
  startedAt: Date;
  endedAt: Date | null;
};

export type CatalogAvailabilityHistoryRange = {
  storeStableId: string;
  trackingStartedAt: Date;
  intervals: CatalogItemUnavailableHistoryInterval[];
};

export interface CatalogAvailabilityHistoryReaderPort {
  /**
   * Returns every MenuItem unavailable interval that overlaps the requested
   * half-open range. null means forward-history capture has not been
   * initialized for this Store.
   */
  readItemUnavailableHistoryForRange(query: {
    storeStableId: string;
    fromInclusive: Date;
    toExclusive: Date;
  }): Promise<CatalogAvailabilityHistoryRange | null>;
}
