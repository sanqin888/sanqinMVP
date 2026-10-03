import type { ReportingWeatherConditionV1 } from './reporting-weather-provider.contract';
import type { ReportingWeatherStoredStatusV1 } from './reporting-weather-history-store.contract';

export type WeatherHistoryReportQueryV1 = {
  storeStableId: string;
  from?: string;
  to?: string;
};

export type WeatherHistoryCoverageStatusV1 =
  | 'COMPLETE'
  | 'PARTIAL'
  | 'UNAVAILABLE';

export type WeatherHistoryRefreshStatusV1 =
  | 'NOT_NEEDED'
  | 'COMPLETE'
  | 'PARTIAL'
  | 'UNAVAILABLE';

export type WeatherHistoryDayV1 = {
  date: string;
  status: ReportingWeatherStoredStatusV1;
  observationHours: number;
  temperatureAvgC: number | null;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  precipitationMm: number | null;
  snowDepthMm: number | null;
  windSpeedKph: number | null;
  peakWindGustKph: number | null;
  sunshineMinutes: number | null;
  significantCondition: ReportingWeatherConditionV1 | null;
  refreshedAt: string | null;
};

export type WeatherHistoryReportV1 = {
  version: 1;
  storeStableId: string;
  timezone: string;
  from: string;
  to: string;
  source: {
    provider: 'METEOSTAT';
    method: 'POINT_HOURLY_AGGREGATE';
    attribution: 'Meteostat and its data providers';
    license: 'CC BY 4.0';
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/';
    transformation: 'SanQ hourly-to-daily Store-local aggregation';
  };
  coverage: {
    status: WeatherHistoryCoverageStatusV1;
    requestedDays: number;
    availableDays: number;
    provisionalDays: number;
    partialDays: number;
    unavailableDays: number;
    refresh: WeatherHistoryRefreshStatusV1;
    limitation:
      | null
      | 'STORE_COORDINATES_MISSING'
      | 'PROVIDER_UNAVAILABLE';
  };
  days: WeatherHistoryDayV1[];
};
