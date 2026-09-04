import { Inject, Injectable } from '@nestjs/common';
import type { AdminMenuFullResponse, DailySpecialDto } from '@shared/menu';
import { CatalogAdminService } from '../../menu/public-api';
import {
  DAILY_SPECIAL_OFFERS,
  type DailySpecialOffersPort,
  type DailySpecialUpsertPayload,
} from '../../promotions/public-api';

@Injectable()
export class CatalogOffersMenuOrchestrationService {
  constructor(
    private readonly catalog: CatalogAdminService,
    @Inject(DAILY_SPECIAL_OFFERS)
    private readonly dailySpecialOffers: DailySpecialOffersPort,
  ) {}

  async getFullMenu(): Promise<AdminMenuFullResponse> {
    const catalogMenu = await this.catalog.getFullMenu();
    const catalogItems = catalogMenu.categories.flatMap((category) =>
      category.items.map((item) => ({
        itemStableId: item.stableId,
        basePriceCents: item.basePriceCents,
      })),
    );
    const { specials } =
      await this.dailySpecialOffers.getActiveDailySpecials(catalogItems);
    const firstSpecialByItemStableId = new Map<string, DailySpecialDto>();
    for (const special of specials) {
      if (!firstSpecialByItemStableId.has(special.itemStableId)) {
        firstSpecialByItemStableId.set(special.itemStableId, special);
      }
    }

    return {
      ...catalogMenu,
      categories: catalogMenu.categories.map((category) => ({
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
      })),
      dailySpecials: specials,
    };
  }

  async getDailySpecials(
    weekday?: number,
  ): Promise<{ specials: DailySpecialDto[] }> {
    const catalogItems = await this.catalog.getMenuItemPricingSnapshots({
      includeDeleted: true,
    });
    return this.dailySpecialOffers.getDailySpecials(weekday, catalogItems);
  }

  async upsertDailySpecials(
    payload: DailySpecialUpsertPayload,
  ): Promise<{ specials: DailySpecialDto[] }> {
    const writableCatalogItems =
      await this.catalog.getMenuItemPricingSnapshots();
    await this.dailySpecialOffers.upsertDailySpecials(
      payload,
      writableCatalogItems,
    );
    const readableCatalogItems =
      await this.catalog.getMenuItemPricingSnapshots({
        includeDeleted: true,
      });
    return this.dailySpecialOffers.getDailySpecials(
      undefined,
      readableCatalogItems,
    );
  }
}
