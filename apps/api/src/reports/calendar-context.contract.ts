export type CalendarContextReportQueryV1 = {
  storeStableId: string;
  from?: string;
  to?: string;
};

export type CalendarWeekdayV1 =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

export type CalendarHolidayV1 = {
  holidayStableId: string;
  nameEn: string;
  nameZh: string;
  jurisdiction: 'CA-ON';
  category: 'ONTARIO_PUBLIC_HOLIDAY';
};

export type CalendarLongWeekendV1 = {
  holidayStableId: string;
  nameEn: string;
  nameZh: string;
  startDate: string;
  endDate: string;
  role: 'HOLIDAY' | 'ADJACENT_WEEKEND';
};

export type CalendarContextDayV1 = {
  date: string;
  weekday: CalendarWeekdayV1;
  classificationStatus: 'SUPPORTED' | 'UNAVAILABLE';
  isPublicHoliday: boolean | null;
  holidays: CalendarHolidayV1[];
  longWeekend: CalendarLongWeekendV1 | null;
};

export type CalendarContextReportV1 = {
  version: 1;
  storeStableId: string;
  timezone: string;
  from: string;
  to: string;
  source: {
    ruleset: 'CA-ON-ESA-PUBLIC-HOLIDAYS';
    rulesetVersion: '2026-10-03-v1';
    supportedFrom: '2008-01-01';
    authorities: Array<{
      title: string;
      url: string;
    }>;
    longWeekendDefinition: 'PUBLIC_HOLIDAY_ON_FRIDAY_OR_MONDAY_PLUS_ADJACENT_WEEKEND';
    substituteHolidayPolicy: 'NOT_INFERRED_WITHOUT_HISTORICAL_STORE_EVIDENCE';
    operatingScheduleMeaning: 'DOES_NOT_ASSERT_STORE_CLOSED';
  };
  coverage: {
    status: 'COMPLETE' | 'UNAVAILABLE';
    jurisdiction: string;
    limitation: null | 'UNSUPPORTED_JURISDICTION';
  };
  days: CalendarContextDayV1[];
};
