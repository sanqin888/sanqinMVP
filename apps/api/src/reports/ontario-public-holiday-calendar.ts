import { DateTime } from 'luxon';

import type {
  CalendarHolidayV1,
  CalendarLongWeekendV1,
} from './calendar-context.contract';

export const ONTARIO_PUBLIC_HOLIDAY_RULESET = {
  ruleset: 'CA-ON-ESA-PUBLIC-HOLIDAYS' as const,
  rulesetVersion: '2026-10-03-v1' as const,
  supportedFrom: '2008-01-01' as const,
  jurisdiction: 'CA-ON' as const,
};

type HolidayDefinition = CalendarHolidayV1 & {
  date: string;
};

type LongWeekendDefinition = Omit<CalendarLongWeekendV1, 'role'> & {
  holidayDate: string;
};

const HOLIDAY_METADATA = {
  newYearsDay: {
    holidayStableId: 'ca-on-new-years-day',
    nameEn: "New Year's Day",
    nameZh: '新年',
  },
  familyDay: {
    holidayStableId: 'ca-on-family-day',
    nameEn: 'Family Day',
    nameZh: '家庭日',
  },
  goodFriday: {
    holidayStableId: 'ca-on-good-friday',
    nameEn: 'Good Friday',
    nameZh: '耶稣受难日',
  },
  victoriaDay: {
    holidayStableId: 'ca-on-victoria-day',
    nameEn: 'Victoria Day',
    nameZh: '维多利亚日',
  },
  canadaDay: {
    holidayStableId: 'ca-on-canada-day',
    nameEn: 'Canada Day',
    nameZh: '加拿大日',
  },
  labourDay: {
    holidayStableId: 'ca-on-labour-day',
    nameEn: 'Labour Day',
    nameZh: '劳动节',
  },
  thanksgivingDay: {
    holidayStableId: 'ca-on-thanksgiving-day',
    nameEn: 'Thanksgiving Day',
    nameZh: '感恩节',
  },
  christmasDay: {
    holidayStableId: 'ca-on-christmas-day',
    nameEn: 'Christmas Day',
    nameZh: '圣诞节',
  },
  boxingDay: {
    holidayStableId: 'ca-on-boxing-day',
    nameEn: 'Boxing Day',
    nameZh: '节礼日',
  },
} as const;

const asHoliday = (
  metadata: {
    holidayStableId: string;
    nameEn: string;
    nameZh: string;
  },
  date: DateTime,
): HolidayDefinition => ({
  ...metadata,
  jurisdiction: 'CA-ON',
  category: 'ONTARIO_PUBLIC_HOLIDAY',
  date: requireIsoDate(date),
});

const requireIsoDate = (date: DateTime): string => {
  const value = date.toISODate();
  if (!value) {
    throw new Error('Ontario public holiday date could not be resolved');
  }
  return value;
};

const nthWeekdayOfMonth = (
  year: number,
  month: number,
  weekday: number,
  occurrence: number,
): DateTime => {
  const first = DateTime.utc(year, month, 1);
  const offset = (weekday - first.weekday + 7) % 7;
  return first.plus({ days: offset + (occurrence - 1) * 7 });
};

const victoriaDay = (year: number): DateTime => {
  const may24 = DateTime.utc(year, 5, 24);
  return may24.minus({ days: may24.weekday - 1 });
};

const canadaDay = (year: number): DateTime => {
  const july1 = DateTime.utc(year, 7, 1);
  return july1.weekday === 7 ? july1.plus({ days: 1 }) : july1;
};

const easterSunday = (year: number): DateTime => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return DateTime.utc(year, month, day);
};

export const getOntarioPublicHolidaysForYear = (
  year: number,
): HolidayDefinition[] => {
  if (year < 2008) return [];

  const easter = easterSunday(year);

  return [
    asHoliday(HOLIDAY_METADATA.newYearsDay, DateTime.utc(year, 1, 1)),
    asHoliday(HOLIDAY_METADATA.familyDay, nthWeekdayOfMonth(year, 2, 1, 3)),
    asHoliday(HOLIDAY_METADATA.goodFriday, easter.minus({ days: 2 })),
    asHoliday(HOLIDAY_METADATA.victoriaDay, victoriaDay(year)),
    asHoliday(HOLIDAY_METADATA.canadaDay, canadaDay(year)),
    asHoliday(HOLIDAY_METADATA.labourDay, nthWeekdayOfMonth(year, 9, 1, 1)),
    asHoliday(
      HOLIDAY_METADATA.thanksgivingDay,
      nthWeekdayOfMonth(year, 10, 1, 2),
    ),
    asHoliday(HOLIDAY_METADATA.christmasDay, DateTime.utc(year, 12, 25)),
    asHoliday(HOLIDAY_METADATA.boxingDay, DateTime.utc(year, 12, 26)),
  ];
};

export const getOntarioLongWeekendsForYear = (
  year: number,
): LongWeekendDefinition[] =>
  getOntarioPublicHolidaysForYear(year)
    .map((holiday) => {
      const date = DateTime.fromISO(holiday.date, { zone: 'UTC' });
      if (date.weekday === 5) {
        return {
          holidayStableId: holiday.holidayStableId,
          nameEn: holiday.nameEn,
          nameZh: holiday.nameZh,
          holidayDate: holiday.date,
          startDate: holiday.date,
          endDate: requireIsoDate(date.plus({ days: 2 })),
        };
      }
      if (date.weekday === 1) {
        return {
          holidayStableId: holiday.holidayStableId,
          nameEn: holiday.nameEn,
          nameZh: holiday.nameZh,
          holidayDate: holiday.date,
          startDate: requireIsoDate(date.minus({ days: 2 })),
          endDate: holiday.date,
        };
      }
      return null;
    })
    .filter((weekend): weekend is LongWeekendDefinition => weekend !== null);
