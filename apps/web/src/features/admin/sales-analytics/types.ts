import type { AccountingSalesAnalyticsReport } from '@/lib/contracts/accounting-sales';
import type { BusinessOperationsReportView } from '../business-reports/types';

export type SalesAnalyticsRangeMode = 'single' | '7d' | '30d' | '90d';
export type SalesAnalyticsBusinessReport = Pick<
  BusinessOperationsReportView,
  | 'storeStableId'
  | 'timezone'
  | 'generatedAt'
  | 'range'
  | 'coverage'
  | 'operatingHistory'
  | 'summary'
  | 'comparison'
  | 'timeline'
  | 'byChannel'
  | 'commercialItems'
>;

export type SalesAnalyticsWeatherCondition =
  | 'CLEAR'
  | 'FAIR'
  | 'CLOUDY'
  | 'OVERCAST'
  | 'FOG'
  | 'RAIN'
  | 'HEAVY_RAIN'
  | 'FREEZING_RAIN'
  | 'SLEET'
  | 'SNOW'
  | 'HAIL'
  | 'THUNDERSTORM'
  | 'STORM';

export type SalesAnalyticsWeatherReport = {
  storeStableId: string;
  timezone: string;
  from: string;
  to: string;
  source: {
    provider: 'METEOSTAT';
    attribution: string;
    license: 'CC BY 4.0';
    licenseUrl: string;
    transformation: string;
  };
  coverage: {
    status: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE';
    requestedDays: number;
    availableDays: number;
    provisionalDays: number;
    partialDays: number;
    unavailableDays: number;
    refresh: 'NOT_NEEDED' | 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE';
    limitation: null | 'STORE_COORDINATES_MISSING' | 'PROVIDER_UNAVAILABLE';
  };
  days: Array<{
    date: string;
    status: 'HISTORICAL' | 'PROVISIONAL' | 'PARTIAL' | 'UNAVAILABLE';
    observationHours: number;
    temperatureAvgC: number | null;
    temperatureMinC: number | null;
    temperatureMaxC: number | null;
    precipitationMm: number | null;
    snowDepthMm: number | null;
    windSpeedKph: number | null;
    peakWindGustKph: number | null;
    sunshineMinutes: number | null;
    significantCondition: SalesAnalyticsWeatherCondition | null;
    refreshedAt: string | null;
  }>;
};

export type SalesAnalyticsCalendarReport = {
  storeStableId: string;
  timezone: string;
  from: string;
  to: string;
  source: {
    ruleset: 'CA-ON-ESA-PUBLIC-HOLIDAYS';
    rulesetVersion: string;
    supportedFrom: string;
    longWeekendDefinition: string;
    substituteHolidayPolicy: string;
    operatingScheduleMeaning: string;
  };
  coverage: {
    status: 'COMPLETE' | 'UNAVAILABLE';
    jurisdiction: string;
    limitation: null | 'UNSUPPORTED_JURISDICTION';
  };
  days: Array<{
    date: string;
    weekday:
      | 'MONDAY'
      | 'TUESDAY'
      | 'WEDNESDAY'
      | 'THURSDAY'
      | 'FRIDAY'
      | 'SATURDAY'
      | 'SUNDAY';
    classificationStatus: 'SUPPORTED' | 'UNAVAILABLE';
    isPublicHoliday: boolean | null;
    holidays: Array<{
      holidayStableId: string;
      nameEn: string;
      nameZh: string;
      jurisdiction: 'CA-ON';
      category: 'ONTARIO_PUBLIC_HOLIDAY';
    }>;
    longWeekend: null | {
      holidayStableId: string;
      nameEn: string;
      nameZh: string;
      startDate: string;
      endDate: string;
      role: 'HOLIDAY' | 'ADJACENT_WEEKEND';
    };
  }>;
};

export type SalesAnalyticsBundle = {
  sales: AccountingSalesAnalyticsReport;
  previousSales: AccountingSalesAnalyticsReport | null;
  business: SalesAnalyticsBusinessReport;
  weather: SalesAnalyticsWeatherReport | null;
  calendar: SalesAnalyticsCalendarReport | null;
};
