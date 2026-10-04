export const CATALOG_STORE_TIMEZONE = Symbol('CATALOG_STORE_TIMEZONE');
export const CATALOG_HISTORY_STORE_DIRECTORY = Symbol(
  'CATALOG_HISTORY_STORE_DIRECTORY',
);

export interface CatalogStoreTimezonePort {
  getStoreTimezone(storeStableId: string): Promise<string>;
}

export interface CatalogHistoryStoreDirectoryPort {
  listStoreStableIds(): Promise<string[]>;
}
