export const CATALOG_EXTERNAL_MENU_FACTS_READER = Symbol(
  'CATALOG_EXTERNAL_MENU_FACTS_READER',
);

export type CatalogExternalMenuCategoryFact = {
  stableId: string;
  nameEn: string;
  nameZh: string | null;
  sortOrder: number;
  isActive: boolean;
};

export type CatalogExternalMenuItemFact = {
  stableId: string;
  categoryStableId: string;
  nameEn: string;
  nameZh: string | null;
  basePriceCents: number;
  isAvailable: boolean;
  tempUnavailableUntil: string | null;
  visibility: 'PUBLIC' | 'HIDDEN';
  publishToUberEats: boolean;
  sortOrder: number;
  imageUrl: string | null;
  ingredientsEn: string | null;
  optionGroups: Array<{
    templateGroupStableId: string;
    sortOrder: number;
    isEnabled: boolean;
  }>;
};

export type CatalogExternalMenuModifierGroupFact = {
  stableId: string;
  nameEn: string;
  nameZh: string | null;
  defaultMinSelect: number;
  defaultMaxSelect: number | null;
  isAvailable: boolean;
  sortOrder: number;
  options: Array<{
    stableId: string;
    nameEn: string;
    nameZh: string | null;
    priceDeltaCents: number;
    isAvailable: boolean;
    tempUnavailableUntil: string | null;
    sortOrder: number;
    targetItemStableId: string | null;
    childTemplateGroupStableIds: string[];
  }>;
};

export type CatalogExternalMenuSourceFacts = {
  categories: CatalogExternalMenuCategoryFact[];
  items: CatalogExternalMenuItemFact[];
  modifierGroups: CatalogExternalMenuModifierGroupFact[];
};

export type CatalogExternalMenuItemSourceFact = {
  stableId: string;
  basePriceCents: number;
  isAvailable: boolean;
};

export type CatalogExternalMenuOptionSourceFact = {
  stableId: string;
  priceDeltaCents: number;
  isAvailable: boolean;
};

export type CatalogExternalMenuModifierGroupSourceFact = {
  stableId: string;
  nameEn: string;
  defaultMinSelect: number;
  defaultMaxSelect: number | null;
};

export type CatalogExternalOrderModifierSnapshotSourceFact = {
  stableId: string;
  templateGroupStableId: string;
  targetItemStableId: string | null;
  nameEn: string;
  nameZh: string | null;
  templateNameEn: string;
  templateNameZh: string | null;
};

export interface CatalogExternalMenuFactsReaderPort {
  readMenuSource(): Promise<CatalogExternalMenuSourceFacts>;
  getMenuItemSource(
    stableId: string,
  ): Promise<CatalogExternalMenuItemSourceFact | null>;
  getOptionSource(
    stableId: string,
  ): Promise<CatalogExternalMenuOptionSourceFact | null>;
  getModifierGroupSource(
    stableId: string,
  ): Promise<CatalogExternalMenuModifierGroupSourceFact | null>;
  listOrderModifierSnapshotSources(): Promise<
    CatalogExternalOrderModifierSnapshotSourceFact[]
  >;
}
