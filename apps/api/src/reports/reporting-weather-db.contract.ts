export const REPORTING_WEATHER_DB = Symbol('REPORTING_WEATHER_DB');

export type ReportingWeatherDbRowV1 = {
  storeStableId: string;
  localDate: string;
  timezone: string;
  latitude: number;
  longitude: number;
  provider: string;
  sourceMethod: string;
  status: string;
  observationHours: number;
  temperatureAvgC: number | null;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  precipitationMm: number | null;
  snowDepthMm: number | null;
  windSpeedKph: number | null;
  peakWindGustKph: number | null;
  sunshineMinutes: number | null;
  significantCondition: string | null;
  refreshedAt: Date;
};

export interface ReportingWeatherDbPort {
  readDailyFacts(query: {
    storeStableId: string;
    from: string;
    to: string;
  }): Promise<ReportingWeatherDbRowV1[]>;

  upsertDailyFacts(rows: ReportingWeatherDbRowV1[]): Promise<void>;
}
