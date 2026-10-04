export const REPORTING_STORE_OPERATING_HISTORY_QUERY = Symbol(
  'REPORTING_STORE_OPERATING_HISTORY_QUERY',
);
export const REPORTING_CATALOG_AVAILABILITY_HISTORY_QUERY = Symbol(
  'REPORTING_CATALOG_AVAILABILITY_HISTORY_QUERY',
);

export type ReportingHistoricalBusinessHourV1 = {
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  openMinutes: number | null;
  closeMinutes: number | null;
  isClosed: boolean;
};

export type ReportingHistoricalHolidayV1 = {
  date: string;
  name: string | null;
  isClosed: boolean;
  openMinutes: number | null;
  closeMinutes: number | null;
};

export type ReportingStoreScheduleHistoryVersionV1 = {
  revision: number;
  effectiveFrom: Date;
  timezone: string;
  businessHours: ReportingHistoricalBusinessHourV1[];
  holidays: ReportingHistoricalHolidayV1[];
};

export type ReportingStoreOperatingHistoryRangeV1 = {
  storeStableId: string;
  trackingStartedAt: Date;
  scheduleVersions: ReportingStoreScheduleHistoryVersionV1[];
  temporaryClosures: Array<{
    startedAt: Date;
    endedAt: Date | null;
  }>;
};

export interface ReportingStoreOperatingHistoryQueryPort {
  readOperatingHistoryForRange(query: {
    storeStableId: string;
    fromInclusive: Date;
    toExclusive: Date;
  }): Promise<ReportingStoreOperatingHistoryRangeV1 | null>;
}

export type ReportingCatalogUnavailableIntervalV1 = {
  menuItemStableId: string;
  nameEnSnapshot: string;
  nameZhSnapshot: string | null;
  startedAt: Date;
  endedAt: Date | null;
};

export type ReportingCatalogAvailabilityHistoryRangeV1 = {
  storeStableId: string;
  trackingStartedAt: Date;
  intervals: ReportingCatalogUnavailableIntervalV1[];
};

export interface ReportingCatalogAvailabilityHistoryQueryPort {
  readItemUnavailableHistoryForRange(query: {
    storeStableId: string;
    fromInclusive: Date;
    toExclusive: Date;
  }): Promise<ReportingCatalogAvailabilityHistoryRangeV1 | null>;
}
