import { MeteostatWeatherProvider } from './meteostat-weather.provider';

const ORIGINAL_KEY = process.env.METEOSTAT_RAPIDAPI_KEY;

describe('MeteostatWeatherProvider', () => {
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.METEOSTAT_RAPIDAPI_KEY;
    else process.env.METEOSTAT_RAPIDAPI_KEY = ORIGINAL_KEY;
  });

  it('aggregates hourly point observations into one daily Reporting fact', async () => {
    process.env.METEOSTAT_RAPIDAPI_KEY = 'test-key';
    const get = jest.fn().mockResolvedValue({
      data: {
        data: [
          {
            time: '2026-10-02 10:00:00',
            temp: 10,
            prcp: 0,
            snow: 0,
            wspd: 8,
            wpgt: 15,
            tsun: 20,
            coco: 2,
          },
          {
            time: '2026-10-02 11:00:00',
            temp: 14,
            prcp: 2.5,
            snow: 0,
            wspd: 12,
            wpgt: 22,
            tsun: 0,
            coco: 8,
          },
        ],
      },
    });
    const provider = new MeteostatWeatherProvider({
      axiosRef: { get },
    } as never);

    const result = await provider.readDailyWeather({
      latitude: 43.760288,
      longitude: -79.412167,
      timezone: 'America/Toronto',
      from: '2026-10-02',
      to: '2026-10-02',
    });

    expect(result.status).toBe('COMPLETE');
    expect(result.attemptedDates).toEqual(['2026-10-02']);
    expect(result.days).toEqual([
      expect.objectContaining({
        localDate: '2026-10-02',
        observationHours: 2,
        temperatureAvgC: 12,
        temperatureMinC: 10,
        temperatureMaxC: 14,
        precipitationMm: 2.5,
        windSpeedKph: 10,
        peakWindGustKph: 22,
        sunshineMinutes: 20,
        significantCondition: 'RAIN',
      }),
    ]);
    expect(get).toHaveBeenCalledWith(
      expect.stringContaining('/point/hourly?'),
      expect.objectContaining({
        timeout: 10000,
        headers: expect.objectContaining({
          'X-RapidAPI-Key': 'test-key',
        }),
      }),
    );
    expect(get.mock.calls[0]?.[0]).toContain('tz=America%2FToronto');
  });

  it('chunks ranges longer than Meteostat hourly 30-day limit', async () => {
    process.env.METEOSTAT_RAPIDAPI_KEY = 'test-key';
    const get = jest.fn().mockResolvedValue({ data: { data: [] } });
    const provider = new MeteostatWeatherProvider({
      axiosRef: { get },
    } as never);

    const result = await provider.readDailyWeather({
      latitude: 43.760288,
      longitude: -79.412167,
      timezone: 'America/Toronto',
      from: '2026-08-01',
      to: '2026-08-31',
    });

    expect(get).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('COMPLETE');
    expect(result.attemptedDates).toHaveLength(31);
  });

  it('returns unavailable without making an HTTP request when the API key is absent', async () => {
    delete process.env.METEOSTAT_RAPIDAPI_KEY;
    const get = jest.fn();
    const provider = new MeteostatWeatherProvider({
      axiosRef: { get },
    } as never);

    await expect(
      provider.readDailyWeather({
        latitude: 43.760288,
        longitude: -79.412167,
        timezone: 'America/Toronto',
        from: '2026-10-01',
        to: '2026-10-01',
      }),
    ).resolves.toEqual({
      provider: 'METEOSTAT',
      status: 'UNAVAILABLE',
      attemptedDates: [],
      days: [],
    });
    expect(get).not.toHaveBeenCalled();
  });

  it('returns partial evidence if a later provider chunk fails', async () => {
    process.env.METEOSTAT_RAPIDAPI_KEY = 'test-key';
    const get = jest
      .fn()
      .mockResolvedValueOnce({ data: { data: [] } })
      .mockRejectedValueOnce(new Error('rate limited'));
    const provider = new MeteostatWeatherProvider({
      axiosRef: { get },
    } as never);

    const result = await provider.readDailyWeather({
      latitude: 43.760288,
      longitude: -79.412167,
      timezone: 'America/Toronto',
      from: '2026-08-01',
      to: '2026-08-31',
    });

    expect(result.status).toBe('PARTIAL');
    expect(result.attemptedDates).toHaveLength(30);
  });
});
