export const UBER_CATALOG_MENU_FACTS_QUERY = Symbol(
  'UBER_CATALOG_MENU_FACTS_QUERY',
);

export type UberCatalogMenuSourceFacts = {
  categories: Array<{
    stableId: string;
    nameEn: string;
    nameZh: string | null;
    sortOrder: number;
    isActive: boolean;
  }>;
  menuItems: Array<{
    stableId: string;
    categoryStableId: string;
    nameEn: string;
    nameZh: string | null;
    basePriceCents: number;
    isAvailable: boolean;
    tempUnavailableUntil: Date | null;
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
  }>;
  modifierTemplates: Array<{
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
      tempUnavailableUntil: Date | null;
      sortOrder: number;
      targetItemStableId: string | null;
      childTemplateGroupStableIds: string[];
    }>;
  }>;
};

export type UberCatalogMenuItemSourceFact = {
  stableId: string;
  basePriceCents: number;
  isAvailable: boolean;
};

export type UberCatalogMenuOptionSourceFact = {
  stableId: string;
  priceDeltaCents: number;
  isAvailable: boolean;
};

export type UberCatalogModifierGroupSourceFact = {
  stableId: string;
  nameEn: string;
  defaultMinSelect: number;
  defaultMaxSelect: number | null;
};

export type UberCatalogOrderModifierSnapshotSourceFact = {
  stableId: string;
  templateGroupStableId: string;
  targetItemStableId: string | null;
  nameEn: string;
  nameZh: string | null;
  templateNameEn: string;
  templateNameZh: string | null;
};

export interface UberCatalogMenuFactsQueryPort {
  readMenuSource(): Promise<UberCatalogMenuSourceFacts>;
  getMenuItemSource(
    stableId: string,
  ): Promise<UberCatalogMenuItemSourceFact | null>;
  getOptionSource(
    stableId: string,
  ): Promise<UberCatalogMenuOptionSourceFact | null>;
  getModifierGroupSource(
    stableId: string,
  ): Promise<UberCatalogModifierGroupSourceFact | null>;
  listOrderModifierSnapshotSources(): Promise<
    UberCatalogOrderModifierSnapshotSourceFact[]
  >;
}
