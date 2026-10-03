import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';

import {
  REPORTING_STORE_LOCATION_QUERY,
  type ReportingStoreLocationQueryPort,
} from './reporting-store-location-query.contract';
import {
  REPORTING_WEATHER_HISTORY_STORE,
  type ReportingWeatherHistoryStorePort,
  type ReportingWeatherStoredDayV1,
  type ReportingWeatherStoredStatusV1,
} from './reporting-weather-history-store.contract';
import {
  REPORTING_WEATHER_PROVIDER,
  type ReportingWeatherProviderDayV1,
  type ReportingWeatherProviderFetchStatusV1,
  type ReportingWeatherProviderPort,
} from './reporting-weather-provider.contract';
import type {
  WeatherHistoryDayV1,
  WeatherHistoryRefreshStatusV1,
  WeatherHistoryReportQueryV1,
  WeatherHistoryReportV1,
} from './weather-history.contract';

const MAX_RANGE_DAYS = 90;
const CURRENT_DAY_REFRESH_HOURS = 2;
const PROVISIONAL_REFRESH_HOURS = 6;
const DEGRADED_REFRESH_HOURS = 24;
const MIN_HISTORICAL_OBSERVATION_HOURS = 18;

@Injectable()
export class WeatherHistoryService {
  constructor(
    @Inject(REPORTING_STORE_LOCATION_QUERY)
    private readonly storeLocation: ReportingStoreLocationQueryPort,
    @Inject(REPORTING_WEATHER_HISTORY_STORE)
    private readonly historyStore: ReportingWeatherHistoryStorePort,
    @Inject(REPORTING_WEATHER_PROVIDER)
    private readonly weatherProvider: ReportingWeatherProviderPort,
  ) {}

  async getReport(
    query: WeatherHistoryReportQueryV1,
  ): Promise<WeatherHistoryReportV1> {
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
      throw new BadRequestException('future weather dates are not supported');
    }

    const requestedDates = this.listDates(fromDay, toDay);
    if (requestedDates.length > MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `weather range cannot exceed ${MAX_RANGE_DAYS} days`,
      );
    }

    const from = requestedDates[0];
    const to = requestedDates[requestedDates.length - 1];
    const cachedRows = await this.historyStore.readRange({
      storeStableId,
      from,
      to,
    });
    const rowsByDate = new Map(
      cachedRows.map((row) => [row.localDate, row] as const),
    );
    const todayString = today.toISODate();
    if (!todayString) {
      throw new BadRequestException('Store-local date could not be resolved');
    }

    const refreshDates = requestedDates.filter((date) =>
      this.shouldRefresh(rowsByDate.get(date), date, todayString, now),
    );

    let refresh: WeatherHistoryRefreshStatusV1 = 'NOT_NEEDED';
    let limitation: WeatherHistoryReportV1['coverage']['limitation'] = null;

    if (refreshDates.length > 0) {
      if (
        !Number.isFinite(location.latitude) ||
        !Number.isFinite(location.longitude)
      ) {
        refresh = 'UNAVAILABLE';
        limitation = 'STORE_COORDINATES_MISSING';
      } else {
        const refreshResults: ReportingWeatherProviderFetchStatusV1[] = [];
        const upserts: ReportingWeatherStoredDayV1[] = [];
        const refreshedAt = now.toUTC().toJSDate();

        for (const range of this.buildRefreshRanges(refreshDates)) {
          const providerResult = await this.weatherProvider.readDailyWeather({
            latitude: location.latitude as number,
            longitude: location.longitude as number,
            timezone,
            from: range.from,
            to: range.to,
          });
          refreshResults.push(providerResult.status);
          if (providerResult.cacheable === false) break;

          const providerByDate = new Map(
            providerResult.days.map((day) => [day.localDate, day] as const),
          );
          for (const localDate of range.dates) {
            upserts.push(
              this.toStoredDay({
                storeStableId,
                localDate,
                timezone,
                latitude: location.latitude as number,
                longitude: location.longitude as number,
                today: todayString,
                providerDay: providerByDate.get(localDate) ?? null,
                refreshedAt,
              }),
            );
          }
        }

        refresh = this.resolveRefreshStatus(refreshResults);
        if (refresh !== 'COMPLETE') {
          limitation = 'PROVIDER_UNAVAILABLE';
        }
        await this.historyStore.upsertDays(upserts);
        for (const row of upserts) rowsByDate.set(row.localDate, row);
      }
    }

    const days = requestedDates.map((date) =>
      this.toReportDay(date, rowsByDate.get(date) ?? null),
    );
    const availableDays = days.filter(
      (day) => day.status !== 'UNAVAILABLE',
    ).length;
    const provisionalDays = days.filter(
      (day) => day.status === 'PROVISIONAL',
    ).length;
    const partialDays = days.filter((day) => day.status === 'PARTIAL').length;
    const unavailableDays = days.length - availableDays;
    const coverageStatus =
      unavailableDays === 0 && partialDays === 0
        ? 'COMPLETE'
        : availableDays > 0
          ? 'PARTIAL'
          : 'UNAVAILABLE';

    return {
      version: 1,
      storeStableId,
      timezone,
      from,
      to,
      source: {
        provider: 'METEOSTAT',
        method: 'POINT_HOURLY_AGGREGATE',
        attribution: 'Meteostat and its data providers',
        license: 'CC BY 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        transformation: 'SanQ hourly-to-daily Store-local aggregation',
      },
      coverage: {
        status: coverageStatus,
        requestedDays: days.length,
        availableDays,
        provisionalDays,
        partialDays,
        unavailableDays,
        refresh,
        limitation,
      },
      days,
    };
  }

  private buildRefreshRanges(dates: string[]): Array<{
    from: string;
    to: string;
    dates: string[];
  }> {
    const ranges: Array<{ from: string; to: string; dates: string[] }> = [];

    for (const date of dates) {
      const current = ranges[ranges.length - 1];
      const expectedNext = current
        ? DateTime.fromISO(current.to, { zone: 'UTC' })
            .plus({ days: 1 })
            .toISODate()
        : null;
      if (current && expectedNext === date) {
        current.to = date;
        current.dates.push(date);
      } else {
        ranges.push({ from: date, to: date, dates: [date] });
      }
    }

    return ranges;
  }

  private resolveRefreshStatus(
    statuses: ReportingWeatherProviderFetchStatusV1[],
  ): WeatherHistoryRefreshStatusV1 {
    if (statuses.length === 0) return 'NOT_NEEDED';
    if (statuses.every((status) => status === 'COMPLETE')) return 'COMPLETE';
    if (statuses.every((status) => status === 'UNAVAILABLE')) {
      return 'UNAVAILABLE';
    }
    return 'PARTIAL';
  }

  private shouldRefresh(
    row: ReportingWeatherStoredDayV1 | undefined,
    localDate: string,
    today: string,
    now: DateTime,
  ): boolean {
    if (!row) return true;

    const ageHours = Math.max(
      0,
      now.toUTC().diff(DateTime.fromJSDate(row.refreshedAt).toUTC(), 'hours')
        .hours,
    );

    if (localDate === today) {
      return ageHours >= CURRENT_DAY_REFRESH_HOURS;
    }
    if (row.status === 'PROVISIONAL') {
      return ageHours >= PROVISIONAL_REFRESH_HOURS;
    }
    if (row.status === 'PARTIAL' || row.status === 'UNAVAILABLE') {
      return ageHours >= DEGRADED_REFRESH_HOURS;
    }
    return false;
  }

  private toStoredDay(input: {
    storeStableId: string;
    localDate: string;
    timezone: string;
    latitude: number;
    longitude: number;
    today: string;
    providerDay: ReportingWeatherProviderDayV1 | null;
    refreshedAt: Date;
  }): ReportingWeatherStoredDayV1 {
    const status = this.resolveStoredStatus(
      input.localDate,
      input.today,
      input.providerDay,
    );
    const day = input.providerDay;

    return {
      storeStableId: input.storeStableId,
      localDate: input.localDate,
      timezone: input.timezone,
      latitude: input.latitude,
      longitude: input.longitude,
      provider: 'METEOSTAT',
      sourceMethod: 'POINT_HOURLY_AGGREGATE',
      status,
      observationHours: day?.observationHours ?? 0,
      temperatureAvgC: day?.temperatureAvgC ?? null,
      temperatureMinC: day?.temperatureMinC ?? null,
      temperatureMaxC: day?.temperatureMaxC ?? null,
      precipitationMm: day?.precipitationMm ?? null,
      snowDepthMm: day?.snowDepthMm ?? null,
      windSpeedKph: day?.windSpeedKph ?? null,
      peakWindGustKph: day?.peakWindGustKph ?? null,
      sunshineMinutes: day?.sunshineMinutes ?? null,
      significantCondition: day?.significantCondition ?? null,
      refreshedAt: input.refreshedAt,
    };
  }

  private resolveStoredStatus(
    localDate: string,
    today: string,
    day: ReportingWeatherProviderDayV1 | null,
  ): ReportingWeatherStoredStatusV1 {
    if (!day || day.observationHours === 0) return 'UNAVAILABLE';
    if (localDate === today) return 'PROVISIONAL';
    if (day.observationHours < MIN_HISTORICAL_OBSERVATION_HOURS) {
      return 'PARTIAL';
    }
    return 'HISTORICAL';
  }

  private toReportDay(
    date: string,
    row: ReportingWeatherStoredDayV1 | null,
  ): WeatherHistoryDayV1 {
    if (!row) {
      return {
        date,
        status: 'UNAVAILABLE',
        observationHours: 0,
        temperatureAvgC: null,
        temperatureMinC: null,
        temperatureMaxC: null,
        precipitationMm: null,
        snowDepthMm: null,
        windSpeedKph: null,
        peakWindGustKph: null,
        sunshineMinutes: null,
        significantCondition: null,
        refreshedAt: null,
      };
    }

    return {
      date,
      status: row.status,
      observationHours: row.observationHours,
      temperatureAvgC: row.temperatureAvgC,
      temperatureMinC: row.temperatureMinC,
      temperatureMaxC: row.temperatureMaxC,
      precipitationMm: row.precipitationMm,
      snowDepthMm: row.snowDepthMm,
      windSpeedKph: row.windSpeedKph,
      peakWindGustKph: row.peakWindGustKph,
      sunshineMinutes: row.sunshineMinutes,
      significantCondition: row.significantCondition,
      refreshedAt: row.refreshedAt.toISOString(),
    };
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
