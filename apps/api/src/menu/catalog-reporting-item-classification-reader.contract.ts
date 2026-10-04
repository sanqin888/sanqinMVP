export const CATALOG_REPORTING_ITEM_CLASSIFICATION_READER = Symbol(
  'CATALOG_REPORTING_ITEM_CLASSIFICATION_READER',
);

export type CatalogReportingItemKindV1 = 'FOOD' | 'BEVERAGE';

export type CatalogReportingItemClassificationV1 = {
  itemStableId: string;
  storeStableId: string;
  itemKind: CatalogReportingItemKindV1;
};

export interface CatalogReportingItemClassificationReaderPort {
  readItemClassifications(query: {
    storeStableId: string;
    itemStableIds: string[];
  }): Promise<CatalogReportingItemClassificationV1[]>;
}
