import { CatalogOffersMenuOrchestrationService } from './catalog-offers-menu-orchestration.service';

describe('CatalogOffersMenuOrchestrationService', () => {
  it('passes Store-scoped Catalog pricing snapshots to active Daily Special reads', async () => {
    const snapshots = [{ itemStableId: 'item-1', basePriceCents: 1099 }];
    const catalog = {
      getMenuItemPricingSnapshots: jest.fn().mockResolvedValue(snapshots),
    };
    const dailySpecialOffers = {
      getActiveDailySpecials: jest.fn().mockResolvedValue({ specials: [] }),
    };
    const service = new CatalogOffersMenuOrchestrationService(
      catalog as never,
      dailySpecialOffers as never,
    );

    await expect(service.getActiveDailySpecials('store-1')).resolves.toEqual({
      specials: [],
    });
    expect(catalog.getMenuItemPricingSnapshots).toHaveBeenCalledWith('store-1');
    expect(dailySpecialOffers.getActiveDailySpecials).toHaveBeenCalledWith(
      'store-1',
      snapshots,
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

    await service.getDailySpecials('store-1', 5);
    await service.upsertDailySpecials('store-1', payload);

    expect(catalog.getMenuItemPricingSnapshots).toHaveBeenNthCalledWith(
      1,
      'store-1',
      { includeDeleted: true },
    );
    expect(catalog.getMenuItemPricingSnapshots).toHaveBeenNthCalledWith(
      2,
      'store-1',
    );
    expect(catalog.getMenuItemPricingSnapshots).toHaveBeenNthCalledWith(
      3,
      'store-1',
      { includeDeleted: true },
    );
    expect(dailySpecialOffers.getDailySpecials).toHaveBeenNthCalledWith(
      1,
      'store-1',
      5,
      snapshots,
    );
    expect(dailySpecialOffers.upsertDailySpecials).toHaveBeenCalledWith(
      'store-1',
      payload,
      snapshots,
    );
    expect(dailySpecialOffers.getDailySpecials).toHaveBeenNthCalledWith(
      2,
      'store-1',
      undefined,
      snapshots,
    );
  });
});
