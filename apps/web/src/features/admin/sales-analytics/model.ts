import type { AccountingSalesAnalyticsReport } from '@/lib/contracts/accounting-sales';
import type {
  SalesAnalyticsBusinessReport,
  SalesAnalyticsCalendarReport,
  SalesAnalyticsWeatherCondition,
  SalesAnalyticsWeatherReport,
} from './types';

export type SalesAnalyticsDailyRow = {
  date: string;
  netSalesRevenueCents: number;
  grossSalesCents: number;
  contributionCents: number;
  orderCount: number;
  averageOrderTotalCents: number;
  operationalExpectedOrderTotalCents: number;
  temperatureAvgC: number | null;
  precipitationMm: number | null;
  snowDepthMm: number | null;
  weatherCondition: SalesAnalyticsWeatherCondition | null;
  weatherStatus: 'HISTORICAL' | 'PROVISIONAL' | 'PARTIAL' | 'UNAVAILABLE';
  holidayNameEn: string | null;
  holidayNameZh: string | null;
  isPublicHoliday: boolean | null;
  longWeekendNameEn: string | null;
  longWeekendNameZh: string | null;
  longWeekendRole: 'HOLIDAY' | 'ADJACENT_WEEKEND' | null;
};

export function assertCoreReportIdentity(input: {
  storeStableId: string;
  from: string;
  to: string;
  sales: AccountingSalesAnalyticsReport;
  business: SalesAnalyticsBusinessReport;
}): void {
  const { storeStableId, from, to, sales, business } = input;
  if (
    sales.storeStableId !== storeStableId ||
    business.storeStableId !== storeStableId
  ) {
    throw new Error('Store identity mismatch across Sales Analytics reports');
  }
  if (sales.timezone !== business.timezone) {
    throw new Error('Timezone mismatch across Sales Analytics reports');
  }
  if (
    sales.from !== from ||
    sales.to !== to ||
    business.range.from !== from ||
    business.range.to !== to
  ) {
    throw new Error('Date range mismatch across Sales Analytics reports');
  }
}

export function assertContextReportIdentity(input: {
  storeStableId: string;
  timezone: string;
  from: string;
  to: string;
  report: SalesAnalyticsWeatherReport | SalesAnalyticsCalendarReport;
}): void {
  const { storeStableId, timezone, from, to, report } = input;
  if (
    report.storeStableId !== storeStableId ||
    report.timezone !== timezone ||
    report.from !== from ||
    report.to !== to
  ) {
    throw new Error('Context identity mismatch across Sales Analytics reports');
  }
}

export function hasOwnerBackedEvidence(
  sales: AccountingSalesAnalyticsReport,
  business: SalesAnalyticsBusinessReport,
): boolean {
  return sales.journalEntryCount > 0 || business.summary.orderCount > 0;
}

export function buildDailyRows(input: {
  sales: AccountingSalesAnalyticsReport;
  business: SalesAnalyticsBusinessReport;
  weather: SalesAnalyticsWeatherReport | null;
  calendar: SalesAnalyticsCalendarReport | null;
}): SalesAnalyticsDailyRow[] {
  const salesByDate = new Map(input.sales.daily.map((row) => [row.date, row]));
  const businessByDate = new Map(
    input.business.timeline.map((row) => [row.date, row]),
  );
  const weatherByDate = new Map(
    (input.weather?.days ?? []).map((row) => [row.date, row]),
  );
  const calendarByDate = new Map(
    (input.calendar?.days ?? []).map((row) => [row.date, row]),
  );

  const dates = new Set<string>([
    ...salesByDate.keys(),
    ...businessByDate.keys(),
    ...weatherByDate.keys(),
    ...calendarByDate.keys(),
  ]);

  return Array.from(dates)
    .sort((left, right) => left.localeCompare(right))
    .map((date) => {
      const sales = salesByDate.get(date);
      const business = businessByDate.get(date);
      const weather = weatherByDate.get(date);
      const calendar = calendarByDate.get(date);
      const holiday = calendar?.holidays[0] ?? null;

      return {
        date,
        netSalesRevenueCents: sales?.summary.netSalesRevenueCents ?? 0,
        grossSalesCents: sales?.summary.grossSalesCents ?? 0,
        contributionCents: sales?.summary.contributionCents ?? 0,
        orderCount: business?.current.orderCount ?? 0,
        averageOrderTotalCents: business?.current.averageOrderTotalCents ?? 0,
        operationalExpectedOrderTotalCents:
          business?.expected.orderTotalCents ?? 0,
        temperatureAvgC: weather?.temperatureAvgC ?? null,
        precipitationMm: weather?.precipitationMm ?? null,
        snowDepthMm: weather?.snowDepthMm ?? null,
        weatherCondition: weather?.significantCondition ?? null,
        weatherStatus: weather?.status ?? 'UNAVAILABLE',
        holidayNameEn: holiday?.nameEn ?? null,
        holidayNameZh: holiday?.nameZh ?? null,
        isPublicHoliday: calendar?.isPublicHoliday ?? null,
        longWeekendNameEn: calendar?.longWeekend?.nameEn ?? null,
        longWeekendNameZh: calendar?.longWeekend?.nameZh ?? null,
        longWeekendRole: calendar?.longWeekend?.role ?? null,
      };
    });
}
