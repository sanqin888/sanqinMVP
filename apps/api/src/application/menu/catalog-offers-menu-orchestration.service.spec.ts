import { CatalogOffersMenuOrchestrationService } from './catalog-offers-menu-orchestration.service';

describe('CatalogOffersMenuOrchestrationService', () => {
  it('enriches Catalog menu facts with Offers-owned active Daily Special pricing', async () => {
    const catalog = {
      getFullMenu: jest.fn().mockResolvedValue({
        categories: [
          {
            stableId: 'category-1',
            sortOrder: 0,
            nameEn: 'Burgers',
            nameZh: null,
            isActive: true,
            items: [
              {
                stableId: 'item-1',
                categoryStableId: 'category-1',
                nameEn: 'Pork Roujiamo',
                nameZh: null,
                basePriceCents: 1099,
                isAvailable: true,
                visibility: 'PUBLIC',
                isVisibleOnMainMenu: true,
                publishToUberEats: true,
                labelStrategy: 'AUTO',
                itemKind: 'FOOD',
                packagings: [],
                fixedComponents: [],
                tempUnavailableUntil: null,
                sortOrder: 0,
                imageUrl: null,
                ingredientsEn: null,
                ingredientsZh: null,
                optionGroups: [],
              },
            ],
          },
        ],
        templatesLite: [],
        packagingTypes: [],
      }),
      getMenuItemPricingSnapshots: jest.fn(),
    };
    const activeSpecial = {
      stableId: 'special-1',
      weekday: 5,
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
    const dailySpecialOffers = {
      getActiveDailySpecials: jest
        .fn()
        .mockResolvedValue({ specials: [activeSpecial] }),
    };
    const service = new CatalogOffersMenuOrchestrationService(
      catalog as never,
      dailySpecialOffers as never,
    );

    const result = await service.getFullMenu();

    expect(dailySpecialOffers.getActiveDailySpecials).toHaveBeenCalledWith([
      { itemStableId: 'item-1', basePriceCents: 1099 },
    ]);
    expect(result.dailySpecials).toEqual([activeSpecial]);
    expect(result.categories[0]?.items[0]).toEqual(
      expect.objectContaining({
        effectivePriceCents: 799,
        activeSpecial: {
          stableId: 'special-1',
          effectivePriceCents: 799,
          pricingMode: 'OVERRIDE_PRICE',
          disallowCoupons: true,
        },
      }),
    );
  });

  it('passes Catalog base-price snapshots to Offers for Admin list and bulk writes', async () => {
    const snapshots = [{ itemStableId: 'item-1', basePriceCents: 1099 }];
    const catalog = {
      getMenuItemPricingSnapshots: jest.fn().mockResolvedValue(snapshots),
    };
    const dailySpecialOffers = {
      getDailySpecials: jest.fn().mockResolvedValue({ specials: [] }),
      upsertDailySpecials: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CatalogOffersMenuOrchestrationService(
      catalog as never,
      dailySpecialOffers as never,
    );
    const payload = {
      specials: [
        {
          weekday: 5,
          itemStableId: 'item-1',
          pricingMode: 'OVERRIDE_PRICE' as const,
          overridePriceCents: 799,
        },
      ],
    };

    await service.getDailySpecials(5);
    await service.upsertDailySpecials(payload);

    expect(catalog.getMenuItemPricingSnapshots).toHaveBeenNthCalledWith(1, {
      includeDeleted: true,
    });
    expect(catalog.getMenuItemPricingSnapshots).toHaveBeenNthCalledWith(2);
    expect(catalog.getMenuItemPricingSnapshots).toHaveBeenNthCalledWith(3, {
      includeDeleted: true,
    });
    expect(dailySpecialOffers.getDailySpecials).toHaveBeenNthCalledWith(
      1,
      5,
      snapshots,
    );
    expect(dailySpecialOffers.upsertDailySpecials).toHaveBeenCalledWith(
      payload,
      snapshots,
    );
    expect(dailySpecialOffers.getDailySpecials).toHaveBeenNthCalledWith(
      2,
      undefined,
      snapshots,
    );
  });
});
