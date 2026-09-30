import type {
  AdminMenuCategoryDto,
  DailySpecialDto,
  MenuCategoryBaseDto,
  MenuItemWithBindingsDto,
} from '@shared/menu';

export function composeAdminMenuCategories(
  categories: MenuCategoryBaseDto[],
  items: MenuItemWithBindingsDto[],
): AdminMenuCategoryDto[] {
  const itemsByCategory = new Map<string, MenuItemWithBindingsDto[]>();

  items.forEach((item) => {
    const current = itemsByCategory.get(item.categoryStableId) ?? [];
    current.push(item);
    itemsByCategory.set(item.categoryStableId, current);
  });

  return categories.map((category) => ({
    ...category,
    items: (itemsByCategory.get(category.stableId) ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }));
}

export function applyActiveDailySpecials(
  categories: AdminMenuCategoryDto[],
  specials: DailySpecialDto[],
): AdminMenuCategoryDto[] {
  const firstSpecialByItemStableId = new Map<string, DailySpecialDto>();
  specials.forEach((special) => {
    if (!firstSpecialByItemStableId.has(special.itemStableId)) {
      firstSpecialByItemStableId.set(special.itemStableId, special);
    }
  });

  return categories.map((category) => ({
    ...category,
    items: category.items.map((item) => {
      const activeSpecial =
        firstSpecialByItemStableId.get(item.stableId) ?? null;
      return {
        ...item,
        effectivePriceCents: activeSpecial?.effectivePriceCents,
        activeSpecial: activeSpecial
          ? {
              stableId: activeSpecial.stableId,
              effectivePriceCents: activeSpecial.effectivePriceCents,
              pricingMode: activeSpecial.pricingMode,
              disallowCoupons: activeSpecial.disallowCoupons,
            }
          : null,
      };
    }),
  }));
}

export function withStoreStableId(path: string, storeStableId: string): string {
  const normalized = storeStableId.trim();
  if (!normalized) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}storeStableId=${encodeURIComponent(normalized)}`;
}
