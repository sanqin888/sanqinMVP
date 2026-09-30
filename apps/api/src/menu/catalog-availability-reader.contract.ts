export const CATALOG_AVAILABILITY_READER = Symbol(
  'CATALOG_AVAILABILITY_READER',
);

export type CatalogMenuItemAvailabilitySnapshot = {
  stableId: string;
  visibility: 'PUBLIC' | 'HIDDEN';
  publishToUberEats: boolean;
  tempUnavailableUntil: string | null;
  hasFixedComponents: boolean;
};

export type CatalogOptionAvailabilitySnapshot = {
  stableId: string;
  tempUnavailableUntil: string | null;
};

export interface CatalogAvailabilityReaderPort {
  getMenuItemAvailabilitySnapshot(
    storeStableId: string,
    menuItemStableId: string,
  ): Promise<CatalogMenuItemAvailabilitySnapshot | null>;

  getOptionAvailabilitySnapshot(
    storeStableId: string,
    optionChoiceStableId: string,
  ): Promise<CatalogOptionAvailabilitySnapshot | null>;
}
