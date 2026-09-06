export const CATALOG_ORDER_FACTS_READER = Symbol('CATALOG_ORDER_FACTS_READER');

export type CatalogOrderOptionChoiceFact = {
  stableId: string;
  nameEn: string;
  nameZh: string | null;
  priceDeltaCents: number;
  targetItemStableId: string | null;
  isAvailable: boolean;
  tempUnavailableUntil: string | null;
  sortOrder: number;
};

export type CatalogOrderOptionGroupFact = {
  stableId: string;
  nameEn: string;
  nameZh: string | null;
  defaultMinSelect: number;
  defaultMaxSelect: number | null;
  sortOrder: number;
  options: CatalogOrderOptionChoiceFact[];
};

export type CatalogOrderOptionGroupBindingFact = {
  minSelect: number;
  maxSelect: number | null;
  sortOrder: number;
  templateGroup: CatalogOrderOptionGroupFact;
};

export type CatalogOrderFixedComponentFact = {
  componentItemStableId: string;
  quantity: number;
  sortOrder: number;
};

export type CatalogOrderItemMaterializationFact = {
  stableId: string;
  nameEn: string;
  nameZh: string | null;
  basePriceCents: number;
  isAvailable: boolean;
  tempUnavailableUntil: string | null;
  fixedComponents: CatalogOrderFixedComponentFact[];
  optionGroups: CatalogOrderOptionGroupBindingFact[];
};

export type CatalogOrderLabelStrategy = 'AUTO' | 'ALWAYS' | 'NEVER';

export type CatalogOrderLabelConfigFact = {
  stableId: string;
  nameEn: string;
  nameZh: string | null;
  labelStrategy: CatalogOrderLabelStrategy;
  packagings: Array<{
    sortOrder: number;
    packagingType: {
      stableId: string;
      name: string;
    };
  }>;
  optionGroups: Array<{
    affectedPackagingTypeStableIds: string[];
    templateGroupStableId: string;
  }>;
};

export interface CatalogOrderFactsReaderPort {
  findHiddenMenuItemStableIds(menuItemStableIds: string[]): Promise<string[]>;

  getOrderItemMaterializationFacts(
    menuItemStableIds: string[],
  ): Promise<CatalogOrderItemMaterializationFact[]>;

  getActiveOrderItemMaterializationFact(
    menuItemStableId: string,
  ): Promise<CatalogOrderItemMaterializationFact | null>;

  getOrderLabelConfigs(
    menuItemStableIds: string[],
  ): Promise<CatalogOrderLabelConfigFact[]>;
}
