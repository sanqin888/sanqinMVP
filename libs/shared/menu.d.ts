export type LocalizedName = {
    nameEn: string;
    nameZh: string | null;
};
export type Availability = {
    isAvailable: boolean;
    tempUnavailableUntil: string | null;
};
export type SpecialPricingMode = 'OVERRIDE_PRICE' | 'DISCOUNT_DELTA' | 'DISCOUNT_PERCENT';
export type MenuItemVisibility = 'PUBLIC' | 'HIDDEN';
export type ActiveSpecialDto = {
    stableId: string;
    effectivePriceCents: number;
    pricingMode: SpecialPricingMode;
    disallowCoupons: boolean;
};
export type DailySpecialDto = {
    stableId: string;
    weekday: number;
    itemStableId: string;
    pricingMode: SpecialPricingMode;
    overridePriceCents: number | null;
    discountDeltaCents: number | null;
    discountPercent: number | null;
    startDate: string | null;
    endDate: string | null;
    startMinutes: number | null;
    endMinutes: number | null;
    disallowCoupons: boolean;
    isEnabled: boolean;
    sortOrder: number;
    basePriceCents: number;
    effectivePriceCents: number;
};
export type Money = {
    basePriceCents?: number;
    priceDeltaCents?: number;
};
export type OptionChoiceDto = LocalizedName & Availability & {
    optionStableId: string;
    templateGroupStableId: string;
    priceDeltaCents: number;
    sortOrder: number;
    childOptionStableIds?: string[];
};
export type TemplateGroupLiteDto = LocalizedName & Availability & {
    templateGroupStableId: string;
    defaultMinSelect: number;
    defaultMaxSelect: number | null;
    sortOrder: number;
};
export type TemplateGroupFullDto = TemplateGroupLiteDto & {
    options: OptionChoiceDto[];
};
export type MenuTemplateLite = TemplateGroupLiteDto;
export type MenuTemplateFull = TemplateGroupFullDto;
export type MenuOptionGroupBindingDto = {
    templateGroupStableId: string;
    bindingStableId?: string | null;
    minSelect: number;
    maxSelect: number | null;
    sortOrder: number;
    isEnabled: boolean;
    template: TemplateGroupLiteDto;
    options?: OptionChoiceDto[];
};
export type MenuOptionGroupWithOptionsDto = MenuOptionGroupBindingDto & {
    options: OptionChoiceDto[];
};
export type MenuItemDtoBase = LocalizedName & Availability & {
    stableId: string;
    categoryStableId: string;
    basePriceCents: number;
    effectivePriceCents?: number;
    activeSpecial?: ActiveSpecialDto | null;
    visibility: MenuItemVisibility;
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
    dailySpecials: DailySpecialDto[];
};
export type PublicMenuResponse = {
    categories: PublicMenuCategoryDto[];
    dailySpecials: DailySpecialDto[];
};
export type MenuEntitlementItemDto = LocalizedName & Availability & {
    stableId: string;
    basePriceCents: number;
    imageUrl: string | null;
    ingredientsEn: string | null;
    ingredientsZh: string | null;
    optionGroups: MenuOptionGroupWithOptionsDto[];
    couponStableId: string;
    userCouponId: string;
};
export type MenuEntitlementDto = {
    userCouponId: string;
    couponStableId: string;
    unlockedItemStableIds: string[];
    stackingPolicy: 'EXCLUSIVE' | 'STACKABLE';
};
export type MenuEntitlementsResponse = {
    unlockedItemStableIds: string[];
    unlockedItems: MenuEntitlementItemDto[];
    entitlements: MenuEntitlementDto[];
};
export type AdminMenuFull = AdminMenuFullResponse;
export declare function isAvailableNow(availability: Availability, now?: number): boolean;
