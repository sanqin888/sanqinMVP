export type LocalizedName = {
    nameEn: string;
    nameZh: string | null;
};
export type Availability = {
    isAvailable: boolean;
    tempUnavailableUntil: string | null;
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
export type AdminMenuFull = AdminMenuFullResponse;
export declare function isAvailableNow(availability: Availability, now?: number): boolean;
