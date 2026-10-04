import type {
  AccountingSalesAnalyticsReport,
  AccountingSalesSummary,
} from '@/lib/contracts/accounting-sales';
import {
  assertContextReportIdentity,
  assertCoreReportIdentity,
  buildDailyRows,
  hasOwnerBackedEvidence,
} from './model';
import type {
  SalesAnalyticsBusinessReport,
  SalesAnalyticsCalendarReport,
  SalesAnalyticsWeatherReport,
} from './types';

const summary = (
  overrides: Partial<AccountingSalesSummary> = {},
): AccountingSalesSummary => ({
  grossSalesCents: 10000,
  discountsCents: -500,
  netFoodSalesCents: 9500,
  deliveryRevenueCents: 0,
  cardSurchargeRevenueCents: 0,
  netSalesRevenueCents: 9500,
  outputTaxCents: 1235,
  tipsCents: 0,
  otherOperatingRevenueCents: 0,
  platformCommissionCents: 0,
  paymentProcessingFeeCents: 0,
  platformPromotionCents: 0,
  advertisingCents: 0,
  chargebackCents: 0,
  providerOtherFeeCents: 0,
  contributionCents: 9500,
  ...overrides,
});

const salesReport = (
  overrides: Partial<AccountingSalesAnalyticsReport> = {},
): AccountingSalesAnalyticsReport => ({
  version: 1,
  storeStableId: '4750_Yonge_Street',
  timezone: 'America/Toronto',
  accountingStartDate: '2026-06-01',
  from: '2026-10-03',
  to: '2026-10-03',
  summary: summary(),
  daily: [
    {
      date: '2026-10-03',
      journalEntryCount: 2,
      summary: summary(),
    },
  ],
  byChannel: [],
  byPrimaryPaymentMethod: [],
  tenderMix: [],
  bySource: [],
  byExternalClassification: [],
  attribution: {
    immutableOrderAttributedJournalEntries: 2,
    legacyOrderAttributedJournalEntries: 0,
    missingOrderAttributedJournalEntries: 0,
    worstQuality: 'IMMUTABLE',
  },
  providerCoverage: {
    overall: 'COMPLETE',
    providers: [],
  },
  journalEntryCount: 2,
  ...overrides,
});

const businessReport = (
  overrides: Partial<SalesAnalyticsBusinessReport> = {},
): SalesAnalyticsBusinessReport => ({
  storeStableId: '4750_Yonge_Street',
  timezone: 'America/Toronto',
  generatedAt: '2026-10-03T16:00:00.000-04:00',
  range: {
    from: '2026-10-03',
    to: '2026-10-03',
  },
  coverage: {
    orders: 'AVAILABLE',
    firstObservedOrderInProbe: '2026-06-01',
    prepTiming: 'AVAILABLE',
    storeOperatingContext: 'CURRENT_CONFIGURATION_ONLY',
    printHealth: 'UNAVAILABLE',
  },
  operatingHistory: {
    coverage: {
      overall: 'AVAILABLE',
      store: 'AVAILABLE',
      catalog: 'AVAILABLE',
    },
    storeTrackingStartedAt: '2026-10-01T04:00:00.000Z',
    catalogTrackingStartedAt: '2026-10-01T04:00:00.000Z',
    days: [
      {
        date: '2026-10-03',
        coverage: 'AVAILABLE',
        scheduledMinutes: 660,
        temporaryClosureMinutes: 360,
        temporaryClosureIntervals: [
          {
            startedAt: '2026-10-03T17:00:00.000Z',
            endedAt: '2026-10-03T22:00:00.000Z',
          },
          {
            startedAt: '2026-10-04T00:00:00.000Z',
            endedAt: '2026-10-04T01:00:00.000Z',
          },
        ],
        operatingMinutes: 300,
        unavailableItemCount: 1,
        unavailableItems: [
          {
            menuItemStableId: 'item-1',
            nameEn: 'Item One',
            nameZh: '菜品一',
            unavailableMinutes: 90,
            unavailableIntervals: [
              {
                startedAt: '2026-10-03T18:00:00.000Z',
                endedAt: '2026-10-03T18:30:00.000Z',
              },
              {
                startedAt: '2026-10-03T23:00:00.000Z',
                endedAt: '2026-10-04T00:00:00.000Z',
              },
            ],
          },
        ],
      },
    ],
  },
  summary: {
    orderTotalCents: 11000,
    orderCount: 5,
    averageOrderTotalCents: 2200,
  },
  comparison: {
    comparablePeriods: 8,
    confidence: 'SUFFICIENT',
    expected: {
      orderTotalCents: 9000,
      orderCount: 4,
      averageOrderTotalCents: 2250,
    },
    delta: {
      orderTotalCents: 2000,
      orderCount: 1,
      averageOrderTotalCents: -50,
    },
  },
  timeline: [
    {
      date: '2026-10-03',
      current: {
        orderTotalCents: 11000,
        orderCount: 5,
        averageOrderTotalCents: 2200,
      },
      expected: {
        orderTotalCents: 9000,
        orderCount: 4,
        averageOrderTotalCents: 2250,
      },
    },
  ],
  byChannel: [],
  commercialItems: [],
  ...overrides,
});

const weatherReport: SalesAnalyticsWeatherReport = {
  storeStableId: '4750_Yonge_Street',
  timezone: 'America/Toronto',
  from: '2026-10-03',
  to: '2026-10-03',
  source: {
    provider: 'METEOSTAT',
    attribution: 'Meteostat and its data providers',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    transformation: 'SanQ hourly-to-daily Store-local aggregation',
  },
  coverage: {
    status: 'COMPLETE',
    requestedDays: 1,
    availableDays: 1,
    provisionalDays: 1,
    partialDays: 0,
    unavailableDays: 0,
    refresh: 'COMPLETE',
    limitation: null,
  },
  days: [
    {
      date: '2026-10-03',
      status: 'PROVISIONAL',
      observationHours: 12,
      temperatureAvgC: 12,
      temperatureMinC: 8,
      temperatureMaxC: 16,
      precipitationMm: 3,
      snowDepthMm: 0,
      windSpeedKph: 10,
      peakWindGustKph: 20,
      sunshineMinutes: 120,
      significantCondition: 'RAIN',
      refreshedAt: '2026-10-03T16:00:00.000Z',
    },
  ],
};

const calendarReport: SalesAnalyticsCalendarReport = {
  storeStableId: '4750_Yonge_Street',
  timezone: 'America/Toronto',
  from: '2026-10-03',
  to: '2026-10-03',
  source: {
    ruleset: 'CA-ON-ESA-PUBLIC-HOLIDAYS',
    rulesetVersion: '2026-10-03-v1',
    supportedFrom: '2008-01-01',
    longWeekendDefinition:
      'PUBLIC_HOLIDAY_ON_FRIDAY_OR_MONDAY_PLUS_ADJACENT_WEEKEND',
    substituteHolidayPolicy: 'NOT_INFERRED_WITHOUT_HISTORICAL_STORE_EVIDENCE',
    operatingScheduleMeaning: 'DOES_NOT_ASSERT_STORE_CLOSED',
  },
  coverage: {
    status: 'COMPLETE',
    jurisdiction: 'CA-ON',
    limitation: null,
  },
  days: [
    {
      date: '2026-10-03',
      weekday: 'SATURDAY',
      classificationStatus: 'SUPPORTED',
      isPublicHoliday: false,
      holidays: [],
      longWeekend: null,
    },
  ],
};

describe('Sales Analytics presentation model', () => {
  it('requires core Store/timezone/range identity before joining reports', () => {
    expect(() =>
      assertCoreReportIdentity({
        storeStableId: '4750_Yonge_Street',
        from: '2026-10-03',
        to: '2026-10-03',
        sales: salesReport(),
        business: businessReport(),
      }),
    ).not.toThrow();

    expect(() =>
      assertCoreReportIdentity({
        storeStableId: 'other_store',
        from: '2026-10-03',
        to: '2026-10-03',
        sales: salesReport(),
        business: businessReport(),
      }),
    ).toThrow('Store identity mismatch');
  });

  it('requires context Store/timezone/range identity when context is available', () => {
    expect(() =>
      assertContextReportIdentity({
        storeStableId: '4750_Yonge_Street',
        timezone: 'America/Toronto',
        from: '2026-10-03',
        to: '2026-10-03',
        report: weatherReport,
      }),
    ).not.toThrow();

    expect(() =>
      assertContextReportIdentity({
        storeStableId: '4750_Yonge_Street',
        timezone: 'America/Toronto',
        from: '2026-10-02',
        to: '2026-10-03',
        report: calendarReport,
      }),
    ).toThrow('Context identity mismatch');
  });

  it('uses canonical Journal or Orders as owner-backed next-day evidence', () => {
    expect(hasOwnerBackedEvidence(salesReport(), businessReport())).toBe(true);
    expect(
      hasOwnerBackedEvidence(
        salesReport({ journalEntryCount: 0, daily: [] }),
        businessReport({
          summary: {
            orderTotalCents: 0,
            orderCount: 0,
            averageOrderTotalCents: 0,
          },
        }),
      ),
    ).toBe(false);
    expect(
      hasOwnerBackedEvidence(
        salesReport({ journalEntryCount: 1 }),
        businessReport({
          summary: {
            orderTotalCents: 0,
            orderCount: 0,
            averageOrderTotalCents: 0,
          },
        }),
      ),
    ).toBe(true);
  });

  it('joins daily canonical money, operating baseline, weather and calendar by local date', () => {
    const rows = buildDailyRows({
      sales: salesReport(),
      business: businessReport(),
      weather: weatherReport,
      calendar: calendarReport,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.date).toBe('2026-10-03');
    expect(rows[0]?.netSalesRevenueCents).toBe(9500);
    expect(rows[0]?.orderCount).toBe(5);
    expect(rows[0]?.operationalExpectedOrderTotalCents).toBe(9000);
    expect(rows[0]?.operatingHistoryCoverage).toBe('AVAILABLE');
    expect(rows[0]?.operatingMinutes).toBe(300);
    expect(rows[0]?.temporaryClosureMinutes).toBe(360);
    expect(rows[0]?.temporaryClosureIntervals).toHaveLength(2);
    expect(rows[0]?.unavailableItemCount).toBe(1);
    expect(rows[0]?.unavailableItems[0]).toMatchObject({
      menuItemStableId: 'item-1',
      unavailableMinutes: 90,
    });
    expect(rows[0]?.unavailableItems[0]?.unavailableIntervals).toHaveLength(2);
    expect(rows[0]?.temperatureAvgC).toBe(12);
    expect(rows[0]?.precipitationMm).toBe(3);
    expect(rows[0]?.weatherCondition).toBe('RAIN');
    expect(rows[0]?.isPublicHoliday).toBe(false);
    expect(rows[0]?.longWeekendRole).toBeNull();
  });
});
