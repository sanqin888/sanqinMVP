export const REPORTING_STORE_OPERATING_CONTEXT_QUERY = Symbol(
  'REPORTING_STORE_OPERATING_CONTEXT_QUERY',
);

export type ReportingStoreWeekdayV1 = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type ReportingStoreBusinessHourV1 = {
  weekday: ReportingStoreWeekdayV1;
  openMinutes: number | null;
  closeMinutes: number | null;
  isClosed: boolean;
};

export type ReportingStoreHolidayV1 = {
  date: string;
  name: string | null;
  isClosed: boolean;
  openMinutes: number | null;
  closeMinutes: number | null;
};

export type ReportingStoreCurrentStatusV1 = {
  isOpenBySchedule: boolean;
  isTemporarilyClosed: boolean;
  today: {
    date: string;
    closeMinutes: number | null;
  };
};

export type ReportingStoreOperatingContextV1 = {
  storeStableId: string;
  timezone: string;
  isActive: boolean;
  historyCoverage: 'CURRENT_CONFIGURATION_ONLY';
  businessHours: ReportingStoreBusinessHourV1[];
  holidays: ReportingStoreHolidayV1[];
  currentStatus: ReportingStoreCurrentStatusV1;
};

export interface ReportingStoreOperatingContextQueryPort {
  getStoreOperatingContext(
    storeStableId: string,
  ): Promise<ReportingStoreOperatingContextV1>;
}
