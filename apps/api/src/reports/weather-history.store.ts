import { Inject, Injectable } from '@nestjs/common';

import {
  REPORTING_WEATHER_DB,
  type ReportingWeatherDbPort,
  type ReportingWeatherDbRowV1,
} from './reporting-weather-db.contract';
import type {
  ReportingWeatherHistoryStorePort,
  ReportingWeatherStoredDayV1,
  ReportingWeatherStoredStatusV1,
} from './reporting-weather-history-store.contract';
import type { ReportingWeatherConditionV1 } from './reporting-weather-provider.contract';

const STORED_STATUSES = new Set<ReportingWeatherStoredStatusV1>([
  'HISTORICAL',
  'PROVISIONAL',
  'PARTIAL',
  'UNAVAILABLE',
]);

const CONDITIONS = new Set<ReportingWeatherConditionV1>([
  'CLEAR',
  'FAIR',
  'CLOUDY',
  'OVERCAST',
  'FOG',
  'RAIN',
  'HEAVY_RAIN',
  'FREEZING_RAIN',
  'SLEET',
  'SNOW',
  'HAIL',
  'THUNDERSTORM',
  'STORM',
]);

@Injectable()
export class WeatherHistoryStore implements ReportingWeatherHistoryStorePort {
  constructor(
    @Inject(REPORTING_WEATHER_DB)
    private readonly db: ReportingWeatherDbPort,
  ) {}

  async readRange(query: {
    storeStableId: string;
    from: string;
    to: string;
  }): Promise<ReportingWeatherStoredDayV1[]> {
    const rows = await this.db.readDailyFacts(query);
    return rows.map((row) => this.fromDbRow(row));
  }

  async upsertDays(days: ReportingWeatherStoredDayV1[]): Promise<void> {
    if (days.length === 0) return;
    await this.db.upsertDailyFacts(days.map((day) => ({ ...day })));
  }

  private fromDbRow(row: ReportingWeatherDbRowV1): ReportingWeatherStoredDayV1 {
    if (row.provider !== 'METEOSTAT') {
      throw new Error(
        `Unsupported Reporting weather provider in persistence: ${row.provider}`,
      );
    }
    if (row.sourceMethod !== 'POINT_HOURLY_AGGREGATE') {
      throw new Error(
        `Unsupported Reporting weather source method: ${row.sourceMethod}`,
      );
    }
    if (!STORED_STATUSES.has(row.status as ReportingWeatherStoredStatusV1)) {
      throw new Error(
        `Unsupported Reporting weather stored status: ${row.status}`,
      );
    }
    if (
      row.significantCondition !== null &&
      !CONDITIONS.has(row.significantCondition as ReportingWeatherConditionV1)
    ) {
      throw new Error(
        `Unsupported Reporting weather condition: ${row.significantCondition}`,
      );
    }

    return {
      ...row,
      provider: 'METEOSTAT',
      sourceMethod: 'POINT_HOURLY_AGGREGATE',
      status: row.status as ReportingWeatherStoredStatusV1,
      significantCondition:
        row.significantCondition as ReportingWeatherConditionV1 | null,
    };
  }
}
