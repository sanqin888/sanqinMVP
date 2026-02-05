// apps/web/src/lib/menu/menu-transformer.ts

import type { Locale } from "@/lib/i18n/locales";
import type {
  ActiveSpecialDto,
  AdminMenuCategoryDto,
  DailySpecialDto,
  MenuEntitlementItemDto,
  MenuOptionGroupWithOptionsDto,
  PublicMenuCategoryDto,
  TemplateGroupFullDto,
} from "@shared/menu";

/** ===== 菜单类型（完全由 API 提供，字段名均为 stableId 语义） ===== */

export type LocalizedMenuItem = {
  stableId: string;
  name: string; // localized display name
  nameEn: string;
  nameZh?: string | null;
  price: number; // CAD
  basePriceCents: number;
  effectivePriceCents: number;
  activeSpecial?: ActiveSpecialDto | null;
  imageUrl?: string;
  ingredients?: string;
  isAvailable: boolean;
  tempUnavailableUntil?: string | null;
  isVisibleOnMainMenu: boolean;

  // 注意：对外只暴露 templateGroupStableId / stableId（以及 admin 才会有 bindingStableId）
  optionGroups?: MenuOptionGroupWithOptionsDto[];
};

export type LocalizedCategory = {
  stableId: string;
  name: string;
  items: LocalizedMenuItem[];
};

/** ===== API 菜单类型（对齐 /admin/menu/full 与 /menu/public） ===== */
type DbMenuCategory = AdminMenuCategoryDto;
type DbPublicMenuCategory = PublicMenuCategoryDto;

export type LocalizedDailySpecial = {
  stableId: string;
  itemStableId: string;
  name: string;
  nameEn: string;
  nameZh?: string | null;
  basePriceCents: number;
  effectivePriceCents: number;
  disallowCoupons: boolean;
  sortOrder: number;
};

export function buildLocalizedEntitlementItems(
  unlockedItems: MenuEntitlementItemDto[],
  locale: Locale,
): LocalizedMenuItem[] {
  const isZh = locale === "zh";

  return (unlockedItems ?? []).map<LocalizedMenuItem>((item) => {
    const name = isZh && item.nameZh ? item.nameZh : item.nameEn;
    const ingredientsText =
      (isZh && item.ingredientsZh ? item.ingredientsZh : item.ingredientsEn) ?? "";
    const ingredients = ingredientsText.trim() ? ingredientsText : undefined;

    const optionGroups = (item.optionGroups ?? [])
      .filter((group) => group.isEnabled)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((group) => {
        const options = (group.options ?? [])
          .filter((opt) => opt.isAvailable)
          .sort((a, b) => a.sortOrder - b.sortOrder);

        return {
          ...group,
          options,
        };
      });

    return {
      stableId: item.stableId,
      name,
      nameEn: item.nameEn,
      nameZh: item.nameZh ?? undefined,
      price: item.basePriceCents / 100,
      basePriceCents: item.basePriceCents,
      effectivePriceCents: item.basePriceCents,
      imageUrl: item.imageUrl ?? undefined,
      ingredients,
      isAvailable: item.isAvailable,
      tempUnavailableUntil: item.tempUnavailableUntil ?? null,
      isVisibleOnMainMenu: true,
      optionGroups,
    };
  });
}

/**
 * 真正用于前台展示的菜单类型（与 LocalizedCategory 相同）
 */
export type PublicMenuCategory = LocalizedCategory;

/**
 * ⭐ 从「数据库菜单（/admin/menu/full 或 /menu/public 返回的结构）」构建前台本地化菜单。
 *
 * - 分类名称用 DB 的 nameEn/nameZh；
 * - 菜品名称/价格/图片/配料/中英文，全部用 DB；
 * - 返回 isActive && visibility=PUBLIC && isAvailable 的菜品；是否在主菜单展示由 isVisibleOnMainMenu 控制；
 * - options 同样按“非永久下架”过滤并按 sortOrder 排序。
 */
export function buildLocalizedMenuFromDb(
  dbMenu: Array<DbMenuCategory | DbPublicMenuCategory>,
  locale: Locale,
  templates?: TemplateGroupFullDto[],
): PublicMenuCategory[] {
  const isZh = locale === "zh";
  const templateMap = new Map(
    (templates ?? []).map((t) => [t.templateGroupStableId, t]),
  );

  const activeCategories = (dbMenu ?? [])
    .filter((c) => c.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return activeCategories.map<PublicMenuCategory>((c) => {
    const localizedName = isZh && c.nameZh ? c.nameZh : c.nameEn;

    const items = (c.items ?? [])
      .filter((i) => i.visibility === "PUBLIC" && i.isAvailable)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map<LocalizedMenuItem>((i) => {
        const stableId = i.stableId.trim();
        if (!stableId) {
          throw new Error(
            `[menu] missing stableId for item "${i.nameEn}" (categoryStableId=${c.stableId})`,
          );
        }

        const name = isZh && i.nameZh ? i.nameZh : i.nameEn;

        const ingredientsText =
          (isZh && i.ingredientsZh ? i.ingredientsZh : i.ingredientsEn) ?? "";
        const ingredients = ingredientsText.trim() ? ingredientsText : undefined;

        const optionGroups = (i.optionGroups ?? [])
          .filter((g) => g.isEnabled)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((g) => {
            const templateOptions =
              g.options ?? templateMap.get(g.templateGroupStableId)?.options ?? [];
            const options = templateOptions
              .filter((o) => o.isAvailable)
              .sort((a, b) => a.sortOrder - b.sortOrder);

            return {
              ...g,
              options,
            };
          });

        return {
          stableId,
          name,
          nameEn: i.nameEn,
          nameZh: i.nameZh ?? undefined,
          price:
            (typeof i.effectivePriceCents === "number"
              ? i.effectivePriceCents
              : i.basePriceCents) / 100,
          basePriceCents: i.basePriceCents,
          effectivePriceCents:
            typeof i.effectivePriceCents === "number"
              ? i.effectivePriceCents
              : i.basePriceCents,
          activeSpecial: i.activeSpecial ?? undefined,
          imageUrl: i.imageUrl ?? undefined,
          ingredients,
          isAvailable: i.isAvailable,
          tempUnavailableUntil: i.tempUnavailableUntil ?? null,
          isVisibleOnMainMenu: i.isVisibleOnMainMenu,
          optionGroups,
        };
      });

    return {
      stableId: c.stableId,
      name: localizedName,
      items,
    };
  });
}

export function buildLocalizedDailySpecials(
  specials: DailySpecialDto[],
  categories: PublicMenuCategory[],
  locale: Locale,
): LocalizedDailySpecial[] {
  const itemMap = new Map(
    categories.flatMap((cat) => cat.items.map((item) => [item.stableId, item])),
  );
  const isZh = locale === "zh";

  const localizedSpecials: LocalizedDailySpecial[] = [];

  for (const special of specials ?? []) {
    const item = itemMap.get(special.itemStableId);
    if (!item) continue;
    const name = isZh && item.nameZh ? item.nameZh : item.nameEn;
    localizedSpecials.push({
      stableId: special.stableId,
      itemStableId: special.itemStableId,
      name,
      nameEn: item.nameEn,
      nameZh: item.nameZh ?? undefined,
      basePriceCents: special.basePriceCents,
      effectivePriceCents: special.effectivePriceCents,
      disallowCoupons: special.disallowCoupons,
      sortOrder: special.sortOrder,
    });
  }

  return localizedSpecials.sort((a, b) => a.sortOrder - b.sortOrder);
}
