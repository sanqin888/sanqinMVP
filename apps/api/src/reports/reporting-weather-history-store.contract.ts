import type { ReportingWeatherConditionV1 } from './reporting-weather-provider.contract';

export const REPORTING_WEATHER_HISTORY_STORE = Symbol(
  'REPORTING_WEATHER_HISTORY_STORE',
);

export type ReportingWeatherStoredStatusV1 =
  | 'HISTORICAL'
  | 'PROVISIONAL'
  | 'PARTIAL'
  | 'UNAVAILABLE';

export type ReportingWeatherStoredDayV1 = {
  storeStableId: string;
  localDate: string;
  timezone: string;
  latitude: number;
  longitude: number;
  provider: 'METEOSTAT';
  sourceMethod: 'POINT_HOURLY_AGGREGATE';
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
  refreshedAt: Date;
};

export interface ReportingWeatherHistoryStorePort {
  readRange(query: {
    storeStableId: string;
    from: string;
    to: string;
  }): Promise<ReportingWeatherStoredDayV1[]>;

  upsertDays(days: ReportingWeatherStoredDayV1[]): Promise<void>;
}
