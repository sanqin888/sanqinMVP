/** Prisma-independent snapshot consumed by the Uber menu graph builder. */
export interface UberMenuDraftSource {
  storeId: string;
  uberStoreId: string;
  categories: UberMenuDraftCategorySource[];
  menuItems: UberMenuDraftItemSource[];
  modifierTemplates: UberMenuDraftModifierTemplateSource[];
  itemConfigs: UberMenuDraftItemConfigSource[];
  optionConfigs: UberMenuDraftOptionConfigSource[];
  modifierConfigs: UberMenuDraftModifierConfigSource[];
  categoryConfigs: UberMenuDraftCategoryConfigSource[];
  childGroupBindings: UberMenuDraftChildGroupBindingSource[];
}

export interface UberMenuDraftFilters {
  excludedCategoryIds: ReadonlySet<string>;
  excludedGroupIds: ReadonlySet<string>;
  excludedMenuItemStableIds: ReadonlySet<string>;
  excludedOptionChoiceStableIds: ReadonlySet<string>;
}

export interface UberMenuDraftCategorySource {
  id: string;
  stableId: string;
  nameEn: string;
  nameZh: string;
  sortOrder: number;
  isActive: boolean;
}

export interface UberMenuDraftItemSource {
  stableId: string;
  categoryId: string;
  nameEn: string;
  nameZh: string;
  basePriceCents: number;
  isAvailable: boolean;
  sortOrder: number;
  imageUrl: string | null;
  ingredientsEn: string | null;
  optionGroups: Array<{ templateGroupStableId: string; sortOrder: number }>;
}

export interface UberMenuDraftModifierTemplateSource {
  stableId: string;
  nameEn: string;
  nameZh: string;
  defaultMinSelect: number;
  defaultMaxSelect: number | null;
  isAvailable: boolean;
  sortOrder: number;
  options: Array<{
    stableId: string;
    nameEn: string;
    nameZh: string;
    priceDeltaCents: number;
    isAvailable: boolean;
    sortOrder: number;
    childTemplateGroupStableIds: string[];
  }>;
}

export interface UberMenuDraftItemConfigSource {
  menuItemStableId: string;
  priceCents: number;
  isAvailable: boolean;
  displayName: string | null;
  displayDescription: string | null;
}
export interface UberMenuDraftOptionConfigSource {
  optionChoiceStableId: string;
  priceDeltaCents: number;
  isAvailable: boolean;
  displayName: string | null;
  displayDescription: string | null;
}
export interface UberMenuDraftModifierConfigSource {
  templateGroupStableId: string;
  displayName: string | null;
  minSelect: number | null;
  maxSelect: number | null;
  isActive: boolean;
}
export interface UberMenuDraftCategoryConfigSource {
  menuCategoryStableId: string;
  displayName: string | null;
  sortOrder: number | null;
  isActive: boolean;
}
export interface UberMenuDraftChildGroupBindingSource {
  parentOptionChoiceStableId: string;
  childTemplateGroupStableId: string;
  isBound: boolean;
}

export const emptyUberMenuDraftFilters = (): UberMenuDraftFilters => ({
  excludedCategoryIds: new Set(),
  excludedGroupIds: new Set(),
  excludedMenuItemStableIds: new Set(),
  excludedOptionChoiceStableIds: new Set(),
});
