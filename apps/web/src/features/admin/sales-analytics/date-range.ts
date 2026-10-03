import type { SalesAnalyticsRangeMode } from './types';

export type SalesAnalyticsDateRange = {
  from: string;
  to: string;
};

const DAY_MS = 86_400_000;

function dateOnlyUtcMillis(raw: string): number | null {
  const millis = Date.parse(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(millis)) return null;
  return new Date(millis).toISOString().slice(0, 10) === raw ? millis : null;
}

export function shiftCalendarDate(date: string, offsetDays: number): string {
  const millis = dateOnlyUtcMillis(date);
  if (millis === null) return date;
  return new Date(millis + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

export function rangeForMode(
  mode: SalesAnalyticsRangeMode,
  storeToday: string,
  singleDate: string,
): SalesAnalyticsDateRange {
  if (mode === 'single') {
    return { from: singleDate, to: singleDate };
  }

  const days = mode === '7d' ? 7 : mode === '30d' ? 30 : 90;
  return {
    from: shiftCalendarDate(storeToday, -(days - 1)),
    to: storeToday,
  };
}

export function previousEqualRange(
  range: SalesAnalyticsDateRange,
): SalesAnalyticsDateRange | null {
  const fromMs = dateOnlyUtcMillis(range.from);
  const toMs = dateOnlyUtcMillis(range.to);
  if (fromMs === null || toMs === null || toMs < fromMs) return null;

  const days = Math.floor((toMs - fromMs) / DAY_MS) + 1;
  const previousTo = fromMs - DAY_MS;
  const previousFrom = previousTo - (days - 1) * DAY_MS;
  return {
    from: new Date(previousFrom).toISOString().slice(0, 10),
    to: new Date(previousTo).toISOString().slice(0, 10),
  };
}

export function formatMmDdYyyy(date: string): string {
  const [year, month, day] = date.split('-');
  if (!year || !month || !day) return date;
  return `${month}/${day}/${year}`;
}
