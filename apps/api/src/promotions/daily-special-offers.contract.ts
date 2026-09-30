import type { DailySpecialDto, SpecialPricingMode } from '@shared/menu';

export const DAILY_SPECIAL_OFFERS = Symbol('DAILY_SPECIAL_OFFERS');

export type DailySpecialCatalogItemSnapshot = {
  itemStableId: string;
  basePriceCents: number;
};

export type DailySpecialUpsertEntry = {
  stableId?: string | null;
  weekday: number;
  itemStableId: string;
  pricingMode: SpecialPricingMode;
  overridePriceCents?: number | null;
  discountDeltaCents?: number | null;
  discountPercent?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  startMinutes?: number | null;
  endMinutes?: number | null;
  disallowCoupons?: boolean;
  isEnabled?: boolean;
  sortOrder?: number;
};

export type DailySpecialUpsertPayload = {
  specials: DailySpecialUpsertEntry[];
};

export interface DailySpecialOffersPort {
  getDailySpecials(
    storeStableId: string,
    weekday: number | undefined,
    catalogItems: readonly DailySpecialCatalogItemSnapshot[],
  ): Promise<{ specials: DailySpecialDto[] }>;

  getActiveDailySpecials(
    storeStableId: string,
    catalogItems: readonly DailySpecialCatalogItemSnapshot[],
  ): Promise<{ specials: DailySpecialDto[] }>;

  upsertDailySpecials(
    storeStableId: string,
    payload: DailySpecialUpsertPayload,
    catalogItems: readonly DailySpecialCatalogItemSnapshot[],
  ): Promise<void>;
}
