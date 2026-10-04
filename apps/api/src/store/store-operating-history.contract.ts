import type {
  StoreBusinessHour,
  StoreHoliday,
} from './store-schedule.contract';

export const STORE_OPERATING_HISTORY_READER = Symbol(
  'STORE_OPERATING_HISTORY_READER',
);

export type StoreOperatingHistoryCoverage = {
  trackingStartedAt: Date;
};

export type StoreScheduleHistoryVersion = {
  revision: number;
  effectiveFrom: Date;
  timezone: string;
  businessHours: StoreBusinessHour[];
  holidays: StoreHoliday[];
};

export type StoreTemporaryClosureHistoryInterval = {
  startedAt: Date;
  endedAt: Date | null;
};

export type StoreOperatingHistoryRange = {
  storeStableId: string;
  coverage: StoreOperatingHistoryCoverage;
  scheduleVersions: StoreScheduleHistoryVersion[];
  temporaryClosures: StoreTemporaryClosureHistoryInterval[];
};

export interface StoreOperatingHistoryReaderPort {
  /**
   * Returns the schedule version active at fromInclusive (when one exists),
   * every later version before toExclusive, and every temporary-closure
   * interval that overlaps the requested half-open range.
   *
   * null means forward-history capture has not been initialized for this Store.
   */
  readOperatingHistoryForRange(
    storeStableId: string,
    fromInclusive: Date,
    toExclusive: Date,
  ): Promise<StoreOperatingHistoryRange | null>;
}
