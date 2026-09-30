import type {
  DailySpecialDto,
  MenuCategoryBaseDto,
  MenuItemWithBindingsDto,
} from '@shared/menu';
import {
  applyActiveDailySpecials,
  composeAdminMenuCategories,
  withStoreStableId,
} from './admin-menu-narrow';

const category: MenuCategoryBaseDto = {
  stableId: 'cat-1',
  nameEn: 'Mains',
  nameZh: '主食',
  sortOrder: 1,
  isActive: true,
};

const item: MenuItemWithBindingsDto = {
  stableId: 'item-1',
  categoryStableId: 'cat-1',
  nameEn: 'Roujiamo',
  nameZh: '肉夹馍',
  basePriceCents: 1099,
  isAvailable: true,
  tempUnavailableUntil: null,
  visibility: 'PUBLIC',
  isVisibleOnMainMenu: true,
  publishToUberEats: true,
  labelStrategy: 'AUTO',
  itemKind: 'FOOD',
  packagings: [],
  fixedComponents: [],
  sortOrder: 0,
  imageUrl: null,
  ingredientsEn: null,
  ingredientsZh: null,
  optionGroups: [],
};

describe('narrow Admin menu composition', () => {
  it('rebuilds the category/item shape expected by existing menu consumers', () => {
    expect(composeAdminMenuCategories([category], [item])).toEqual([
      { ...category, items: [item] },
    ]);
  });

  it('reapplies active Daily Special pricing without the legacy full endpoint', () => {
    const special: DailySpecialDto = {
      stableId: 'special-1',
      weekday: 3,
      itemStableId: 'item-1',
      pricingMode: 'OVERRIDE_PRICE',
      overridePriceCents: 799,
      discountDeltaCents: null,
      discountPercent: null,
      startDate: null,
      endDate: null,
      startMinutes: null,
      endMinutes: null,
      disallowCoupons: true,
      isEnabled: true,
      sortOrder: 0,
      basePriceCents: 1099,
      effectivePriceCents: 799,
    };

    const [enriched] = applyActiveDailySpecials(
      composeAdminMenuCategories([category], [item]),
      [special],
    );
    expect(enriched?.items[0]).toMatchObject({
      effectivePriceCents: 799,
      activeSpecial: {
        stableId: 'special-1',
        effectivePriceCents: 799,
        pricingMode: 'OVERRIDE_PRICE',
        disallowCoupons: true,
      },
    });
  });

  it('adds explicit Store identity to narrow Admin menu paths', () => {
    expect(withStoreStableId('/admin/menu/items', ' store-1 ')).toBe(
      '/admin/menu/items?storeStableId=store-1',
    );
  });
});
