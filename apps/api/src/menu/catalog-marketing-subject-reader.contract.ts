export const CATALOG_MARKETING_SUBJECT_READER = Symbol(
  'CATALOG_MARKETING_SUBJECT_READER',
);

export type CatalogMarketingItemSubjectV1 = {
  itemStableId: string;
  storeStableId: string;
  nameEn: string;
  nameZh: string | null;
};

export interface CatalogMarketingSubjectReaderPort {
  readItemSubjects(query?: {
    storeStableId?: string;
  }): Promise<CatalogMarketingItemSubjectV1[]>;
}
