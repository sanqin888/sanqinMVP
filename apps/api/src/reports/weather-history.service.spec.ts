import type { ReportingStoreLocationContextV1 } from './reporting-store-location-query.contract';
import { WeatherHistoryService } from './weather-history.service';

const STORE: ReportingStoreLocationContextV1 = {
  storeStableId: '4750_Yonge_Street',
  timezone: 'America/Toronto',
  latitude: 43.760288,
  longitude: -79.412167,
  countryCode: 'CA',
  province: 'ON',
};

function setup(options?: {
  cached?: Array<Record<string, unknown>>;
  providerResult?: Record<string, unknown>;
  store?: ReportingStoreLocationContextV1;
}) {
  const storeLocation = {
    getStoreLocationContext: jest
      .fn()
      .mockResolvedValue(options?.store ?? STORE),
  };
  const historyStore = {
    readRange: jest.fn().mockResolvedValue(options?.cached ?? []),
    upsertDays: jest.fn().mockResolvedValue(undefined),
  };
  const weatherProvider = {
    readDailyWeather: jest.fn().mockResolvedValue(
      options?.providerResult ?? {
        provider: 'METEOSTAT',
        status: 'COMPLETE',
        attemptedDates: ['2026-10-01', '2026-10-02', '2026-10-03'],
        days: [
          {
            localDate: '2026-10-01',
            observationHours: 24,
            temperatureAvgC: 14,
            temperatureMinC: 9,
            temperatureMaxC: 19,
            precipitationMm: 0,
            snowDepthMm: 0,
            windSpeedKph: 9,
            peakWindGustKph: 20,
            sunshineMinutes: 480,
            significantCondition: 'FAIR',
          },
          {
            localDate: '2026-10-02',
            observationHours: 24,
            temperatureAvgC: 12,
            temperatureMinC: 8,
            temperatureMaxC: 17,
            precipitationMm: 8,
            snowDepthMm: 0,
            windSpeedKph: 12,
            peakWindGustKph: 28,
            sunshineMinutes: 120,
            significantCondition: 'RAIN',
          },
          {
            localDate: '2026-10-03',
            observationHours: 10,
            temperatureAvgC: 11,
            temperatureMinC: 7,
            temperatureMaxC: 15,
            precipitationMm: 1,
            snowDepthMm: 0,
            windSpeedKph: 8,
            peakWindGustKph: 18,
            sunshineMinutes: 60,
            significantCondition: 'CLOUDY',
          },
        ],
      },
    ),
  };

  return {
    service: new WeatherHistoryService(
      storeLocation as never,
      historyStore as never,
      weatherProvider as never,
    ),
    storeLocation,
    historyStore,
    weatherProvider,
  };
}

describe('WeatherHistoryService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-03T16:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('refreshes missing Store-scoped weather and marks Today provisional', async () => {
    const { service, historyStore, weatherProvider } = setup();

    const report = await service.getReport({
      storeStableId: STORE.storeStableId,
      from: '2026-10-01',
      to: '2026-10-03',
    });

    expect(weatherProvider.readDailyWeather).toHaveBeenCalledWith({
      latitude: STORE.latitude,
      longitude: STORE.longitude,
      timezone: STORE.timezone,
      from: '2026-10-01',
      to: '2026-10-03',
    });
    expect(historyStore.upsertDays).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          localDate: '2026-10-01',
          status: 'HISTORICAL',
        }),
        expect.objectContaining({
          localDate: '2026-10-03',
          status: 'PROVISIONAL',
        }),
      ]),
    );
    expect(report.coverage).toMatchObject({
      status: 'COMPLETE',
      requestedDays: 3,
      availableDays: 3,
      provisionalDays: 1,
      partialDays: 0,
      unavailableDays: 0,
      refresh: 'COMPLETE',
      limitation: null,
    });
    expect(report.source.attribution).toBe('Meteostat and its data providers');
  });

  it('uses stable cached historical rows without another provider call', async () => {
    const { service, historyStore, weatherProvider } = setup({
      cached: [
        {
          storeStableId: STORE.storeStableId,
          localDate: '2026-09-01',
          timezone: STORE.timezone,
          latitude: STORE.latitude,
          longitude: STORE.longitude,
          provider: 'METEOSTAT',
          sourceMethod: 'POINT_HOURLY_AGGREGATE',
          status: 'HISTORICAL',
          observationHours: 24,
          temperatureAvgC: 20,
          temperatureMinC: 15,
          temperatureMaxC: 25,
          precipitationMm: 0,
          snowDepthMm: 0,
          windSpeedKph: 8,
          peakWindGustKph: 18,
          sunshineMinutes: 600,
          significantCondition: 'CLEAR',
          refreshedAt: new Date('2026-09-02T12:00:00.000Z'),
        },
      ],
    });

    const report = await service.getReport({
      storeStableId: STORE.storeStableId,
      from: '2026-09-01',
      to: '2026-09-01',
    });

    expect(weatherProvider.readDailyWeather).not.toHaveBeenCalled();
    expect(historyStore.upsertDays).not.toHaveBeenCalled();
    expect(report.coverage.refresh).toBe('NOT_NEEDED');
    expect(report.days[0]).toMatchObject({
      status: 'HISTORICAL',
      temperatureAvgC: 20,
    });
  });

  it('refreshes only contiguous cache gaps instead of refetching stable historical days', async () => {
    const cachedRow = (localDate: string) => ({
      storeStableId: STORE.storeStableId,
      localDate,
      timezone: STORE.timezone,
      latitude: STORE.latitude as number,
      longitude: STORE.longitude as number,
      provider: 'METEOSTAT',
      sourceMethod: 'POINT_HOURLY_AGGREGATE',
      status: 'HISTORICAL',
      observationHours: 24,
      temperatureAvgC: 15,
      temperatureMinC: 10,
      temperatureMaxC: 20,
      precipitationMm: 0,
      snowDepthMm: 0,
      windSpeedKph: 8,
      peakWindGustKph: 18,
      sunshineMinutes: 500,
      significantCondition: 'CLEAR',
      refreshedAt: new Date('2026-10-02T12:00:00.000Z'),
    });
    const { service, historyStore, weatherProvider } = setup({
      cached: [cachedRow('2026-09-01'), cachedRow('2026-09-03')],
    });

    await service.getReport({
      storeStableId: STORE.storeStableId,
      from: '2026-09-01',
      to: '2026-09-03',
    });

    expect(weatherProvider.readDailyWeather).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '2026-09-02',
        to: '2026-09-02',
      }),
    );
    expect(historyStore.upsertDays).toHaveBeenCalledWith([
      expect.objectContaining({ localDate: '2026-09-02' }),
    ]);
  });

  it('marks historical under-coverage as PARTIAL instead of COMPLETE', async () => {
    const { service } = setup({
      providerResult: {
        provider: 'METEOSTAT',
        status: 'COMPLETE',
        attemptedDates: ['2026-10-02'],
        days: [
          {
            localDate: '2026-10-02',
            observationHours: 6,
            temperatureAvgC: 12,
            temperatureMinC: 10,
            temperatureMaxC: 14,
            precipitationMm: 0,
            snowDepthMm: 0,
            windSpeedKph: 8,
            peakWindGustKph: 15,
            sunshineMinutes: 60,
            significantCondition: 'FAIR',
          },
        ],
      },
    });

    const report = await service.getReport({
      storeStableId: STORE.storeStableId,
      from: '2026-10-02',
      to: '2026-10-02',
    });

    expect(report.coverage).toMatchObject({
      status: 'PARTIAL',
      availableDays: 1,
      provisionalDays: 0,
      partialDays: 1,
      unavailableDays: 0,
    });
    expect(report.days[0]?.status).toBe('PARTIAL');
  });

  it('fails soft when the provider is unavailable', async () => {
    const { service, historyStore } = setup({
      providerResult: {
        provider: 'METEOSTAT',
        status: 'UNAVAILABLE',
        attemptedDates: [],
        days: [],
      },
    });

    const report = await service.getReport({
      storeStableId: STORE.storeStableId,
      from: '2026-10-02',
      to: '2026-10-02',
    });

    expect(historyStore.upsertDays).toHaveBeenCalledWith([
      expect.objectContaining({
        localDate: '2026-10-02',
        status: 'UNAVAILABLE',
      }),
    ]);
    expect(report.coverage).toMatchObject({
      status: 'UNAVAILABLE',
      refresh: 'UNAVAILABLE',
      limitation: 'PROVIDER_UNAVAILABLE',
    });
    expect(report.days[0]).toMatchObject({
      date: '2026-10-02',
      status: 'UNAVAILABLE',
    });
  });

  it('does not call the provider when Store coordinates are missing', async () => {
    const { service, weatherProvider } = setup({
      store: { ...STORE, latitude: null, longitude: null },
    });

    const report = await service.getReport({
      storeStableId: STORE.storeStableId,
      from: '2026-10-02',
      to: '2026-10-02',
    });

    expect(weatherProvider.readDailyWeather).not.toHaveBeenCalled();
    expect(report.coverage).toMatchObject({
      status: 'UNAVAILABLE',
      refresh: 'UNAVAILABLE',
      limitation: 'STORE_COORDINATES_MISSING',
    });
  });

  it('rejects future and over-90-day ranges', async () => {
    const { service } = setup();

    await expect(
      service.getReport({
        storeStableId: STORE.storeStableId,
        from: '2026-10-04',
        to: '2026-10-04',
      }),
    ).rejects.toThrow('future weather dates are not supported');

    await expect(
      service.getReport({
        storeStableId: STORE.storeStableId,
        from: '2026-07-01',
        to: '2026-10-03',
      }),
    ).rejects.toThrow('weather range cannot exceed 90 days');
  });
});
