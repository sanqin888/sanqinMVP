import type { Locale } from '@/lib/i18n/locales';
import type {
  BusinessReportAnomalyMetric,
  BusinessReportConfidence,
} from './types';

export function shiftCalendarDate(date: string, offsetDays: number): string {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

export function inclusiveCalendarDays(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00.000Z`);
  const toMs = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  return Math.floor((toMs - fromMs) / 86_400_000) + 1;
}

export function formatMoneyFromCents(
  cents: number,
  locale: Locale,
  options: { signed?: boolean } = {},
): string {
  const amount = cents / 100;
  const formatted = new Intl.NumberFormat(
    locale === 'zh' ? 'zh-CA' : 'en-CA',
    {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay: options.signed ? 'always' : 'auto',
    },
  ).format(amount);
  return formatted.replace('CA$', '$');
}

export function formatCount(
  value: number,
  locale: Locale,
  options: { signed?: boolean } = {},
): string {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-CA', {
    maximumFractionDigits: 1,
    signDisplay: options.signed ? 'always' : 'auto',
  }).format(value);
}

export function formatPercent(
  value: number | null,
  locale: Locale,
  options: { signed?: boolean } = {},
): string {
  if (value === null) return locale === 'zh' ? '无基准' : 'No baseline';
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-CA', {
    maximumFractionDigits: 1,
    signDisplay: options.signed ? 'always' : 'auto',
  }).format(value) + '%';
}

export function formatMinutes(
  value: number | null,
  locale: Locale,
  options: { signed?: boolean } = {},
): string {
  if (value === null) return '—';
  const formatted = new Intl.NumberFormat(
    locale === 'zh' ? 'zh-CN' : 'en-CA',
    {
      maximumFractionDigits: 1,
      signDisplay: options.signed ? 'always' : 'auto',
    },
  ).format(value);
  return locale === 'zh' ? `${formatted} 分钟` : `${formatted} min`;
}

export function formatMetricValue(
  metric: BusinessReportAnomalyMetric,
  value: number,
  locale: Locale,
  signed = false,
): string {
  if (metric === 'ORDER_TOTAL' || metric === 'AVERAGE_ORDER_TOTAL') {
    return formatMoneyFromCents(value, locale, { signed });
  }
  if (metric === 'PREP_P90') {
    return formatMinutes(value, locale, { signed });
  }
  return formatCount(value, locale, { signed });
}

export function confidenceLabel(
  confidence: BusinessReportConfidence,
  locale: Locale,
): string {
  if (confidence === 'SUFFICIENT') {
    return locale === 'zh' ? '样本充分' : 'Sufficient';
  }
  if (confidence === 'LOW_SAMPLE') {
    return locale === 'zh' ? '样本不足' : 'Low sample';
  }
  return locale === 'zh' ? '营业上下文有限' : 'Operating context partial';
}

export function anomalyMetricLabel(
  metric: BusinessReportAnomalyMetric,
  locale: Locale,
): string {
  const isZh = locale === 'zh';
  if (metric === 'ORDER_COUNT') return isZh ? '订单量' : 'Order count';
  if (metric === 'ORDER_TOTAL') return isZh ? '订单总额' : 'Order total';
  if (metric === 'AVERAGE_ORDER_TOTAL') {
    return isZh ? '平均订单额' : 'Average order total';
  }
  return isZh ? '备餐 P90' : 'Prep p90';
}

export function anomalyHeadline(
  metric: BusinessReportAnomalyMetric,
  direction: 'ABOVE_EXPECTED' | 'BELOW_EXPECTED',
  locale: Locale,
): string {
  const label = anomalyMetricLabel(metric, locale);
  if (locale === 'zh') {
    return `${label}${direction === 'ABOVE_EXPECTED' ? '高于' : '低于'}历史预期`;
  }
  return `${label} is ${direction === 'ABOVE_EXPECTED' ? 'above' : 'below'} expected`;
}

export function channelLabel(key: string, locale: Locale): string {
  const normalized = key.toLowerCase();
  const labels: Record<string, [string, string]> = {
    in_store: ['店内 / POS', 'In-store / POS'],
    web: ['网站', 'Web'],
    ubereats: ['Uber Eats', 'Uber Eats'],
    uber_eats: ['Uber Eats', 'Uber Eats'],
    fantuan: ['饭团', 'Fantuan'],
  };
  const label = labels[normalized];
  return label ? label[locale === 'zh' ? 0 : 1] : key;
}

export function fulfillmentLabel(key: string, locale: Locale): string {
  const normalized = key.toLowerCase();
  const labels: Record<string, [string, string]> = {
    dine_in: ['堂食', 'Dine-in'],
    takeout: ['外带', 'Takeout'],
    pickup: ['自取', 'Pickup'],
    delivery: ['配送', 'Delivery'],
  };
  const label = labels[normalized];
  return label ? label[locale === 'zh' ? 0 : 1] : key;
}

export function contributorKeyLabel(
  dimension: 'CHANNEL' | 'FULFILLMENT' | 'HOUR',
  key: string,
  locale: Locale,
): string {
  if (dimension === 'CHANNEL') return channelLabel(key, locale);
  if (dimension === 'FULFILLMENT') return fulfillmentLabel(key, locale);
  const hour = Number(key);
  return Number.isFinite(hour)
    ? `${String(hour).padStart(2, '0')}:00`
    : key;
}

export function formatDateTimeInZone(
  iso: string | null,
  timezone: string,
  locale: Locale,
): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-CA', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}
