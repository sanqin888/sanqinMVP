export const REPORTING_CATALOG_ITEM_CLASSIFICATION_QUERY = Symbol(
  'REPORTING_CATALOG_ITEM_CLASSIFICATION_QUERY',
);

export type ReportingCatalogItemKindV1 = 'FOOD' | 'BEVERAGE';

export type ReportingCatalogItemClassificationV1 = {
  itemStableId: string;
  itemKind: ReportingCatalogItemKindV1;
};

export interface ReportingCatalogItemClassificationQueryPort {
  readItemClassifications(query: {
    storeStableId: string;
    itemStableIds: string[];
  }): Promise<ReportingCatalogItemClassificationV1[]>;
}
