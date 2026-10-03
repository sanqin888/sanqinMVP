import type { ReportingStoreLocationContextV1 } from './reporting-store-location-query.contract';
import { CalendarContextService } from './calendar-context.service';

const STORE: ReportingStoreLocationContextV1 = {
  storeStableId: '4750_Yonge_Street',
  timezone: 'America/Toronto',
  latitude: 43.760288,
  longitude: -79.412167,
  countryCode: 'CA',
  province: 'ON',
};

function setup(store: ReportingStoreLocationContextV1 = STORE) {
  const storeLocation = {
    getStoreLocationContext: jest.fn().mockResolvedValue(store),
  };

  return {
    service: new CalendarContextService(storeLocation as never),
    storeLocation,
  };
}

describe('CalendarContextService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-03T16:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns Ontario public-holiday and long-weekend context for Store-local dates', async () => {
    const { service, storeLocation } = setup();

    const report = await service.getReport({
      storeStableId: STORE.storeStableId,
      from: '2026-02-14',
      to: '2026-02-16',
    });

    expect(storeLocation.getStoreLocationContext).toHaveBeenCalledWith(
      STORE.storeStableId,
    );
    expect(report.coverage).toEqual({
      status: 'COMPLETE',
      jurisdiction: 'CA-ON',
      limitation: null,
    });
    expect(report.days).toEqual([
      expect.objectContaining({
        date: '2026-02-14',
        weekday: 'SATURDAY',
        isPublicHoliday: false,
        longWeekend: expect.objectContaining({
          holidayStableId: 'ca-on-family-day',
          role: 'ADJACENT_WEEKEND',
          startDate: '2026-02-14',
          endDate: '2026-02-16',
        }),
      }),
      expect.objectContaining({
        date: '2026-02-15',
        weekday: 'SUNDAY',
        isPublicHoliday: false,
        longWeekend: expect.objectContaining({
          holidayStableId: 'ca-on-family-day',
          role: 'ADJACENT_WEEKEND',
        }),
      }),
      expect.objectContaining({
        date: '2026-02-16',
        weekday: 'MONDAY',
        isPublicHoliday: true,
        holidays: [
          expect.objectContaining({
            holidayStableId: 'ca-on-family-day',
            category: 'ONTARIO_PUBLIC_HOLIDAY',
          }),
        ],
        longWeekend: expect.objectContaining({
          holidayStableId: 'ca-on-family-day',
          role: 'HOLIDAY',
        }),
      }),
    ]);
    expect(report.source.rulesetVersion).toBe('2026-10-03-v1');
  });

  it('marks Civic Holiday and National Day for Truth and Reconciliation as ordinary Ontario ESA dates', async () => {
    const { service } = setup();

    for (const date of ['2026-08-03', '2026-09-30']) {
      const report = await service.getReport({
        storeStableId: STORE.storeStableId,
        from: date,
        to: date,
      });
      expect(report.days[0]).toMatchObject({
        date,
        classificationStatus: 'SUPPORTED',
        isPublicHoliday: false,
        holidays: [],
      });
    }
  });

  it('captures a cross-year long weekend when New Year falls on Monday', async () => {
    const { service } = setup();

    const report = await service.getReport({
      storeStableId: STORE.storeStableId,
      from: '2023-12-30',
      to: '2024-01-01',
    });

    expect(
      report.days.map((day) => [
        day.date,
        day.longWeekend?.holidayStableId ?? null,
        day.longWeekend?.role ?? null,
      ]),
    ).toEqual([
      ['2023-12-30', 'ca-on-new-years-day', 'ADJACENT_WEEKEND'],
      ['2023-12-31', 'ca-on-new-years-day', 'ADJACENT_WEEKEND'],
      ['2024-01-01', 'ca-on-new-years-day', 'HOLIDAY'],
    ]);
  });

  it('fails visibly for unsupported Store jurisdictions instead of treating unknown as no holiday', async () => {
    const { service } = setup({
      ...STORE,
      storeStableId: 'other_store',
      province: 'BC',
    });

    const report = await service.getReport({
      storeStableId: 'other_store',
      from: '2026-07-01',
      to: '2026-07-01',
    });

    expect(report.coverage).toEqual({
      status: 'UNAVAILABLE',
      jurisdiction: 'CA-BC',
      limitation: 'UNSUPPORTED_JURISDICTION',
    });
    expect(report.days[0]).toMatchObject({
      classificationStatus: 'UNAVAILABLE',
      isPublicHoliday: null,
      holidays: [],
      longWeekend: null,
    });
  });

  it('rejects unsupported historical, future and over-90-day ranges', async () => {
    const { service } = setup();

    await expect(
      service.getReport({
        storeStableId: STORE.storeStableId,
        from: '2007-12-31',
        to: '2007-12-31',
      }),
    ).rejects.toThrow('calendar context supports dates from 2008-01-01');

    await expect(
      service.getReport({
        storeStableId: STORE.storeStableId,
        from: '2026-10-04',
        to: '2026-10-04',
      }),
    ).rejects.toThrow('future calendar dates are not supported');

    await expect(
      service.getReport({
        storeStableId: STORE.storeStableId,
        from: '2026-07-01',
        to: '2026-10-03',
      }),
    ).rejects.toThrow('calendar context range cannot exceed 90 days');
  });
});
