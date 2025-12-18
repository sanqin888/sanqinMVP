// libs/shared/menu.ts
// Shared API contracts for menu-related endpoints (used by both backend and frontend).

export type LocalizedName = {
  nameEn: string;
  nameZh: string | null;
};

export type Availability = {
  isAvailable: boolean;
  tempUnavailableUntil: string | null;
};

// Money building block (either basePriceCents for items or priceDeltaCents for options)
export type Money = {
  basePriceCents?: number;
  priceDeltaCents?: number;
};

// ===== Option & Template blocks =====
export type OptionChoiceDto = LocalizedName &
  Availability & {
    optionStableId: string;
    templateGroupStableId: string;
    priceDeltaCents: number;
    sortOrder: number;
  };

export type TemplateGroupLiteDto = LocalizedName &
  Availability & {
    templateGroupStableId: string;
    defaultMinSelect: number;
    defaultMaxSelect: number | null;
    sortOrder: number;
  };

export type TemplateGroupFullDto = TemplateGroupLiteDto & {
  options: OptionChoiceDto[];
};

// ===== Menu building blocks =====
export type MenuOptionGroupBindingDto = {
  templateGroupStableId: string;
  bindingStableId?: string | null;
  minSelect: number;
  maxSelect: number | null;
  sortOrder: number;
  isEnabled: boolean;
  template: TemplateGroupLiteDto;
  // Optional: when provided, they should be sourced from TemplateGroupFullDto.options
  options?: OptionChoiceDto[];
};

export type MenuOptionGroupWithOptionsDto = MenuOptionGroupBindingDto & {
  options: OptionChoiceDto[];
};

export type MenuItemDtoBase = LocalizedName &
  Availability & {
    stableId: string;
    categoryStableId: string;
    basePriceCents: number;
    isVisible: boolean;
    sortOrder: number;
    imageUrl: string | null;
    ingredientsEn: string | null;
    ingredientsZh: string | null;
  };

export type MenuItemWithBindingsDto = MenuItemDtoBase & {
  optionGroups: MenuOptionGroupBindingDto[];
};

export type MenuItemWithOptionsDto = MenuItemDtoBase & {
  optionGroups: MenuOptionGroupWithOptionsDto[];
};

export type MenuCategoryBaseDto = LocalizedName & {
  stableId: string;
  sortOrder: number;
  isActive: boolean;
};

export type AdminMenuCategoryDto = MenuCategoryBaseDto & {
  items: MenuItemWithBindingsDto[];
};

export type PublicMenuCategoryDto = MenuCategoryBaseDto & {
  items: MenuItemWithOptionsDto[];
};

export type AdminMenuFullResponse = {
  categories: AdminMenuCategoryDto[];
  templatesLite: TemplateGroupLiteDto[];
};

export type PublicMenuResponse = {
  categories: PublicMenuCategoryDto[];
};

// Shared availability helper (front/back use the same logic)
export function isAvailableNow(
  availability: Availability,
  now: number = Date.now(),
): boolean {
  if (!availability.isAvailable) return false;
  if (!availability.tempUnavailableUntil) return true;

  const t = Date.parse(availability.tempUnavailableUntil);
  if (!Number.isFinite(t)) return true;

  return now >= t;
}
