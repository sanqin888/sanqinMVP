import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';

import type {
  CalendarContextDayV1,
  CalendarContextReportQueryV1,
  CalendarContextReportV1,
  CalendarWeekdayV1,
} from './calendar-context.contract';
import {
  ONTARIO_PUBLIC_HOLIDAY_RULESET,
  getOntarioLongWeekendsForYear,
  getOntarioPublicHolidaysForYear,
} from './ontario-public-holiday-calendar';
import {
  REPORTING_STORE_LOCATION_QUERY,
  type ReportingStoreLocationQueryPort,
} from './reporting-store-location-query.contract';

const MAX_RANGE_DAYS = 90;

const WEEKDAYS: Record<number, CalendarWeekdayV1> = {
  1: 'MONDAY',
  2: 'TUESDAY',
  3: 'WEDNESDAY',
  4: 'THURSDAY',
  5: 'FRIDAY',
  6: 'SATURDAY',
  7: 'SUNDAY',
};

@Injectable()
export class CalendarContextService {
  constructor(
    @Inject(REPORTING_STORE_LOCATION_QUERY)
    private readonly storeLocation: ReportingStoreLocationQueryPort,
  ) {}

  async getReport(
    query: CalendarContextReportQueryV1,
  ): Promise<CalendarContextReportV1> {
    const storeStableId = query.storeStableId?.trim();
    if (!storeStableId) {
      throw new BadRequestException('storeStableId is required');
    }

    const location =
      await this.storeLocation.getStoreLocationContext(storeStableId);
    const timezone = location.timezone.trim();
    const now = DateTime.now().setZone(timezone);
    if (!now.isValid) {
      throw new BadRequestException('Store timezone is invalid');
    }
    const today = now.startOf('day');

    const explicitFrom = query.from
      ? this.parseLocalDate(query.from, timezone)
      : null;
    const explicitTo = query.to
      ? this.parseLocalDate(query.to, timezone)
      : null;
    const fromDay = explicitFrom ?? explicitTo ?? today;
    const toDay = explicitTo ?? explicitFrom ?? today;

    if (toDay < fromDay) {
      throw new BadRequestException('to must be on or after from');
    }
    if (toDay > today) {
      throw new BadRequestException('future calendar dates are not supported');
    }

    const supportedFrom = DateTime.fromISO(
      ONTARIO_PUBLIC_HOLIDAY_RULESET.supportedFrom,
      { zone: timezone },
    ).startOf('day');
    if (fromDay < supportedFrom) {
      throw new BadRequestException(
        `calendar context supports dates from ${ONTARIO_PUBLIC_HOLIDAY_RULESET.supportedFrom}`,
      );
    }

    const dates = this.listDates(fromDay, toDay);
    if (dates.length > MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `calendar context range cannot exceed ${MAX_RANGE_DAYS} days`,
      );
    }

    const from = dates[0];
    const to = dates[dates.length - 1];
    const jurisdiction = [location.countryCode, location.province]
      .filter(Boolean)
      .join('-')
      .toUpperCase();
    const supportedJurisdiction =
      location.countryCode.trim().toUpperCase() === 'CA' &&
      location.province?.trim().toUpperCase() === 'ON';

    const days = supportedJurisdiction
      ? this.buildOntarioDays(dates, timezone)
      : dates.map((date) => this.buildUnavailableDay(date, timezone));

    return {
      version: 1,
      storeStableId,
      timezone,
      from,
      to,
      source: {
        ruleset: ONTARIO_PUBLIC_HOLIDAY_RULESET.ruleset,
        rulesetVersion: ONTARIO_PUBLIC_HOLIDAY_RULESET.rulesetVersion,
        supportedFrom: ONTARIO_PUBLIC_HOLIDAY_RULESET.supportedFrom,
        authorities: [
          {
            title: 'Ontario ESA public holidays',
            url: 'https://www.ontario.ca/document/your-guide-employment-standards-act-0/public-holidays',
          },
          {
            title: 'Ontario Family Day proclamation',
            url: 'https://www.ontario.ca/page/schedule-order-council-6532026',
          },
          {
            title: 'Ontario ESA public-holiday date rules',
            url: 'https://www.ontario.ca/document/employment-standard-act-policy-and-interpretation-manual/part-i-definitions',
          },
        ],
        longWeekendDefinition:
          'PUBLIC_HOLIDAY_ON_FRIDAY_OR_MONDAY_PLUS_ADJACENT_WEEKEND',
        substituteHolidayPolicy:
          'NOT_INFERRED_WITHOUT_HISTORICAL_STORE_EVIDENCE',
        operatingScheduleMeaning: 'DOES_NOT_ASSERT_STORE_CLOSED',
      },
      coverage: {
        status: supportedJurisdiction ? 'COMPLETE' : 'UNAVAILABLE',
        jurisdiction,
        limitation: supportedJurisdiction
          ? null
          : 'UNSUPPORTED_JURISDICTION',
      },
      days,
    };
  }

  private buildOntarioDays(
    dates: string[],
    timezone: string,
  ): CalendarContextDayV1[] {
    const first = DateTime.fromISO(dates[0], { zone: timezone });
    const last = DateTime.fromISO(dates[dates.length - 1], { zone: timezone });
    const holidays = new Map<
      string,
      ReturnType<typeof getOntarioPublicHolidaysForYear>
    >();
    const longWeekends: ReturnType<
      typeof getOntarioLongWeekendsForYear
    > = [];
    for (let year = first.year - 1; year <= last.year + 1; year += 1) {
      longWeekends.push(...getOntarioLongWeekendsForYear(year));
    }

    for (let year = first.year; year <= last.year; year += 1) {
      for (const holiday of getOntarioPublicHolidaysForYear(year)) {
        const current = holidays.get(holiday.date) ?? [];
        current.push(holiday);
        holidays.set(holiday.date, current);
      }
    }

    return dates.map((date) => {
      const parsed = DateTime.fromISO(date, { zone: timezone });
      const holidayRows = holidays.get(date) ?? [];
      const longWeekend = longWeekends.find(
        (candidate) =>
          date >= candidate.startDate && date <= candidate.endDate,
      );

      return {
        date,
        weekday: this.weekday(parsed),
        classificationStatus: 'SUPPORTED',
        isPublicHoliday: holidayRows.length > 0,
        holidays: holidayRows.map((holiday) => ({
          holidayStableId: holiday.holidayStableId,
          nameEn: holiday.nameEn,
          nameZh: holiday.nameZh,
          jurisdiction: holiday.jurisdiction,
          category: holiday.category,
        })),
        longWeekend: longWeekend
          ? {
              holidayStableId: longWeekend.holidayStableId,
              nameEn: longWeekend.nameEn,
              nameZh: longWeekend.nameZh,
              startDate: longWeekend.startDate,
              endDate: longWeekend.endDate,
              role:
                date === longWeekend.holidayDate
                  ? 'HOLIDAY'
                  : 'ADJACENT_WEEKEND',
            }
          : null,
      };
    });
  }

  private buildUnavailableDay(
    date: string,
    timezone: string,
  ): CalendarContextDayV1 {
    const parsed = DateTime.fromISO(date, { zone: timezone });
    return {
      date,
      weekday: this.weekday(parsed),
      classificationStatus: 'UNAVAILABLE',
      isPublicHoliday: null,
      holidays: [],
      longWeekend: null,
    };
  }

  private weekday(date: DateTime): CalendarWeekdayV1 {
    const weekday = WEEKDAYS[date.weekday];
    if (!weekday) {
      throw new BadRequestException('calendar weekday could not be resolved');
    }
    return weekday;
  }

  private parseLocalDate(value: string, timezone: string): DateTime {
    const parsed = DateTime.fromISO(value, { zone: timezone }).startOf('day');
    if (!parsed.isValid || parsed.toISODate() !== value) {
      throw new BadRequestException('report dates must use YYYY-MM-DD');
    }
    return parsed;
  }

  private listDates(from: DateTime, to: DateTime): string[] {
    const dates: string[] = [];
    let cursor = from;
    while (cursor <= to) {
      const value = cursor.toISODate();
      if (!value) {
        throw new BadRequestException('report date could not be resolved');
      }
      dates.push(value);
      cursor = cursor.plus({ days: 1 });
    }
    return dates;
  }
}
