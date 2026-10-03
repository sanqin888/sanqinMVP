export const REPORTING_WEATHER_PROVIDER = Symbol('REPORTING_WEATHER_PROVIDER');

export type ReportingWeatherConditionV1 =
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

export type ReportingWeatherProviderDayV1 = {
  localDate: string;
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
};

export type ReportingWeatherProviderFetchStatusV1 =
  | 'COMPLETE'
  | 'PARTIAL'
  | 'UNAVAILABLE';

export type ReportingWeatherProviderFetchResultV1 = {
  provider: 'METEOSTAT';
  status: ReportingWeatherProviderFetchStatusV1;
  cacheable: boolean;
  attemptedDates: string[];
  days: ReportingWeatherProviderDayV1[];
};

export interface ReportingWeatherProviderPort {
  readDailyWeather(query: {
    latitude: number;
    longitude: number;
    timezone: string;
    from: string;
    to: string;
  }): Promise<ReportingWeatherProviderFetchResultV1>;
}
