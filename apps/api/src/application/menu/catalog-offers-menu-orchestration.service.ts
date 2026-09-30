import { Inject, Injectable } from '@nestjs/common';
import type { DailySpecialDto } from '@shared/menu';
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

  async getActiveDailySpecials(
    storeStableId: string,
  ): Promise<{ specials: DailySpecialDto[] }> {
    const catalogItems =
      await this.catalog.getMenuItemPricingSnapshots(storeStableId);
    return this.dailySpecialOffers.getActiveDailySpecials(
      storeStableId,
      catalogItems,
    );
  }

  async getDailySpecials(
    storeStableId: string,
    weekday?: number,
  ): Promise<{ specials: DailySpecialDto[] }> {
    const catalogItems = await this.catalog.getMenuItemPricingSnapshots(
      storeStableId,
      { includeDeleted: true },
    );
    return this.dailySpecialOffers.getDailySpecials(
      storeStableId,
      weekday,
      catalogItems,
    );
  }

  async upsertDailySpecials(
    storeStableId: string,
    payload: DailySpecialUpsertPayload,
  ): Promise<{ specials: DailySpecialDto[] }> {
    const writableCatalogItems =
      await this.catalog.getMenuItemPricingSnapshots(storeStableId);
    await this.dailySpecialOffers.upsertDailySpecials(
      storeStableId,
      payload,
      writableCatalogItems,
    );
    const readableCatalogItems = await this.catalog.getMenuItemPricingSnapshots(
      storeStableId,
      { includeDeleted: true },
    );
    return this.dailySpecialOffers.getDailySpecials(
      storeStableId,
      undefined,
      readableCatalogItems,
    );
  }
}
