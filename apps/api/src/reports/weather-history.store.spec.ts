import { WeatherHistoryStore } from './weather-history.store';

const ROW = {
  storeStableId: '4750_Yonge_Street',
  localDate: '2026-10-02',
  timezone: 'America/Toronto',
  latitude: 43.760288,
  longitude: -79.412167,
  provider: 'METEOSTAT',
  sourceMethod: 'POINT_HOURLY_AGGREGATE',
  status: 'HISTORICAL',
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
  refreshedAt: new Date('2026-10-03T00:00:00.000Z'),
};

describe('WeatherHistoryStore', () => {
  it('maps validated Reporting weather DB rows into stored facts', async () => {
    const db = {
      readDailyFacts: jest.fn().mockResolvedValue([ROW]),
      upsertDailyFacts: jest.fn(),
    };
    const store = new WeatherHistoryStore(db as never);

    await expect(
      store.readRange({
        storeStableId: ROW.storeStableId,
        from: ROW.localDate,
        to: ROW.localDate,
      }),
    ).resolves.toEqual([ROW]);
  });

  it('fails closed on unknown persisted provider/status/condition values', async () => {
    const read = async (row: Record<string, unknown>) => {
      const store = new WeatherHistoryStore({
        readDailyFacts: jest.fn().mockResolvedValue([{ ...ROW, ...row }]),
        upsertDailyFacts: jest.fn(),
      } as never);
      return store.readRange({
        storeStableId: ROW.storeStableId,
        from: ROW.localDate,
        to: ROW.localDate,
      });
    };

    await expect(read({ provider: 'OTHER' })).rejects.toThrow(
      'Unsupported Reporting weather provider',
    );
    await expect(read({ status: 'UNKNOWN_STATUS' })).rejects.toThrow(
      'Unsupported Reporting weather stored status',
    );
    await expect(read({ significantCondition: 'ALIENS' })).rejects.toThrow(
      'Unsupported Reporting weather condition',
    );
  });

  it('forwards normalized stored facts through the Reporting-owned DB port', async () => {
    const db = {
      readDailyFacts: jest.fn(),
      upsertDailyFacts: jest.fn().mockResolvedValue(undefined),
    };
    const store = new WeatherHistoryStore(db as never);

    await store.upsertDays([ROW as never]);

    expect(db.upsertDailyFacts).toHaveBeenCalledWith([ROW]);
  });
});
