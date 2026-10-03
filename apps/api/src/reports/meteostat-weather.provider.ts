import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';

import type {
  ReportingWeatherConditionV1,
  ReportingWeatherProviderDayV1,
  ReportingWeatherProviderFetchResultV1,
  ReportingWeatherProviderPort,
} from './reporting-weather-provider.contract';

const METEOSTAT_HOST = 'meteostat.p.rapidapi.com';
const METEOSTAT_HOURLY_URL = 'https://meteostat.p.rapidapi.com/point/hourly';
const MAX_PROVIDER_RANGE_DAYS = 30;

type MeteostatHourlyRow = {
  time?: unknown;
  temp?: unknown;
  prcp?: unknown;
  snow?: unknown;
  wspd?: unknown;
  wpgt?: unknown;
  tsun?: unknown;
  coco?: unknown;
};

type MeteostatHourlyResponse = {
  data?: MeteostatHourlyRow[];
};

type Aggregate = {
  observationHours: number;
  temperatures: number[];
  precipitationValues: number[];
  snowDepthValues: number[];
  windSpeedValues: number[];
  gustValues: number[];
  sunshineValues: number[];
  conditions: ReportingWeatherConditionV1[];
};

const finiteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const sumOrNull = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0);

const averageOrNull = (values: number[]): number | null =>
  values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const minOrNull = (values: number[]): number | null =>
  values.length === 0 ? null : Math.min(...values);

const maxOrNull = (values: number[]): number | null =>
  values.length === 0 ? null : Math.max(...values);

const conditionRank: Record<ReportingWeatherConditionV1, number> = {
  CLEAR: 1,
  FAIR: 2,
  CLOUDY: 3,
  OVERCAST: 4,
  FOG: 5,
  RAIN: 6,
  HEAVY_RAIN: 7,
  FREEZING_RAIN: 8,
  SLEET: 9,
  SNOW: 10,
  HAIL: 11,
  THUNDERSTORM: 12,
  STORM: 13,
};

function mapConditionCode(value: unknown): ReportingWeatherConditionV1 | null {
  const code = finiteNumber(value);
  if (code === null) return null;

  switch (code) {
    case 1:
      return 'CLEAR';
    case 2:
      return 'FAIR';
    case 3:
      return 'CLOUDY';
    case 4:
      return 'OVERCAST';
    case 5:
    case 6:
      return 'FOG';
    case 7:
    case 8:
    case 17:
      return 'RAIN';
    case 9:
    case 18:
      return 'HEAVY_RAIN';
    case 10:
    case 11:
      return 'FREEZING_RAIN';
    case 12:
    case 13:
    case 19:
    case 20:
      return 'SLEET';
    case 14:
    case 15:
    case 16:
    case 21:
    case 22:
      return 'SNOW';
    case 23:
    case 25:
    case 26:
      return 'THUNDERSTORM';
    case 24:
      return 'HAIL';
    case 27:
      return 'STORM';
    default:
      return null;
  }
}

function mostSignificantCondition(
  values: ReportingWeatherConditionV1[],
): ReportingWeatherConditionV1 | null {
  if (values.length === 0) return null;
  return values.reduce((selected, candidate) =>
    conditionRank[candidate] > conditionRank[selected] ? candidate : selected,
  );
}

@Injectable()
export class MeteostatWeatherProvider implements ReportingWeatherProviderPort {
  private readonly logger = new Logger(MeteostatWeatherProvider.name);

  constructor(private readonly http: HttpService) {}

  async readDailyWeather(query: {
    latitude: number;
    longitude: number;
    timezone: string;
    from: string;
    to: string;
  }): Promise<ReportingWeatherProviderFetchResultV1> {
    const apiKey = process.env.METEOSTAT_RAPIDAPI_KEY?.trim();
    if (!apiKey) {
      return {
        provider: 'METEOSTAT',
        status: 'UNAVAILABLE',
        attemptedDates: [],
        days: [],
      };
    }

    const from = DateTime.fromISO(query.from, { zone: query.timezone }).startOf(
      'day',
    );
    const to = DateTime.fromISO(query.to, { zone: query.timezone }).startOf(
      'day',
    );
    const attemptedDates: string[] = [];
    const rows: MeteostatHourlyRow[] = [];
    let cursor = from;
    let complete = true;

    while (cursor <= to) {
      const chunkEnd = DateTime.min(
        cursor.plus({ days: MAX_PROVIDER_RANGE_DAYS - 1 }),
        to,
      );
      const start = cursor.toISODate();
      const end = chunkEnd.toISODate();
      if (!start || !end) {
        complete = false;
        break;
      }

      try {
        const params = new URLSearchParams({
          lat: String(query.latitude),
          lon: String(query.longitude),
          start,
          end,
          tz: query.timezone,
          model: 'true',
          units: 'metric',
        });
        const response = await this.http.axiosRef.get<MeteostatHourlyResponse>(
          `${METEOSTAT_HOURLY_URL}?${params.toString()}`,
          {
            timeout: 10_000,
            headers: {
              Accept: 'application/json',
              'X-RapidAPI-Host': METEOSTAT_HOST,
              'X-RapidAPI-Key': apiKey,
            },
          },
        );
        rows.push(
          ...(Array.isArray(response.data?.data) ? response.data.data : []),
        );
        attemptedDates.push(...this.listDates(cursor, chunkEnd));
      } catch {
        complete = false;
        this.logger.warn(
          `Meteostat weather refresh failed for ${start}..${end}`,
        );
        break;
      }

      cursor = chunkEnd.plus({ days: 1 });
    }

    return {
      provider: 'METEOSTAT',
      status: complete
        ? 'COMPLETE'
        : attemptedDates.length > 0
          ? 'PARTIAL'
          : 'UNAVAILABLE',
      attemptedDates,
      days: this.aggregateRows(rows),
    };
  }

  private aggregateRows(
    rows: MeteostatHourlyRow[],
  ): ReportingWeatherProviderDayV1[] {
    const byDate = new Map<string, Aggregate>();

    for (const row of rows) {
      const time = typeof row.time === 'string' ? row.time : '';
      const localDate = time.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) continue;

      const aggregate = byDate.get(localDate) ?? {
        observationHours: 0,
        temperatures: [],
        precipitationValues: [],
        snowDepthValues: [],
        windSpeedValues: [],
        gustValues: [],
        sunshineValues: [],
        conditions: [],
      };
      aggregate.observationHours += 1;

      const temp = finiteNumber(row.temp);
      if (temp !== null) aggregate.temperatures.push(temp);
      const prcp = finiteNumber(row.prcp);
      if (prcp !== null) aggregate.precipitationValues.push(prcp);
      const snow = finiteNumber(row.snow);
      if (snow !== null) aggregate.snowDepthValues.push(snow);
      const wind = finiteNumber(row.wspd);
      if (wind !== null) aggregate.windSpeedValues.push(wind);
      const gust = finiteNumber(row.wpgt);
      if (gust !== null) aggregate.gustValues.push(gust);
      const sunshine = finiteNumber(row.tsun);
      if (sunshine !== null) aggregate.sunshineValues.push(sunshine);
      const condition = mapConditionCode(row.coco);
      if (condition) aggregate.conditions.push(condition);

      byDate.set(localDate, aggregate);
    }

    return Array.from(byDate.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([localDate, aggregate]) => ({
        localDate,
        observationHours: aggregate.observationHours,
        temperatureAvgC: averageOrNull(aggregate.temperatures),
        temperatureMinC: minOrNull(aggregate.temperatures),
        temperatureMaxC: maxOrNull(aggregate.temperatures),
        precipitationMm: sumOrNull(aggregate.precipitationValues),
        snowDepthMm: maxOrNull(aggregate.snowDepthValues),
        windSpeedKph: averageOrNull(aggregate.windSpeedValues),
        peakWindGustKph: maxOrNull(aggregate.gustValues),
        sunshineMinutes: sumOrNull(aggregate.sunshineValues),
        significantCondition: mostSignificantCondition(aggregate.conditions),
      }));
  }

  private listDates(from: DateTime, to: DateTime): string[] {
    const dates: string[] = [];
    let cursor = from;
    while (cursor <= to) {
      const date = cursor.toISODate();
      if (date) dates.push(date);
      cursor = cursor.plus({ days: 1 });
    }
    return dates;
  }
}
