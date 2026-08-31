export const STORE_SCHEDULE_READER = Symbol('STORE_SCHEDULE_READER');
export const STORE_SCHEDULE_WRITER = Symbol('STORE_SCHEDULE_WRITER');

export type StoreWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type StoreBusinessHour = {
  weekday: StoreWeekday;
  openMinutes: number | null;
  closeMinutes: number | null;
  isClosed: boolean;
};

export type StoreHoliday = {
  date: string;
  name: string | null;
  isClosed: boolean;
  openMinutes: number | null;
  closeMinutes: number | null;
};

export interface StoreScheduleReaderPort {
  listBusinessHours(storeStableId: string): Promise<StoreBusinessHour[]>;
  getBusinessHour(
    storeStableId: string,
    weekday: StoreWeekday,
  ): Promise<StoreBusinessHour | null>;
  listHolidays(storeStableId: string): Promise<StoreHoliday[]>;
}

export interface StoreScheduleWriterPort {
  replaceBusinessHours(
    storeStableId: string,
    hours: StoreBusinessHour[],
  ): Promise<void>;
  replaceHolidays(
    storeStableId: string,
    holidays: StoreHoliday[],
  ): Promise<void>;
}
