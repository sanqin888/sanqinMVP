import { DateTime } from 'luxon';
import { SpecialPricingMode } from '@prisma/client';
import { resolvePromotionLinePriceCents } from '../promotions/promotion-engine';

export type DailySpecialLike = {
  pricingMode: SpecialPricingMode;
  overridePriceCents: number | null;
  discountDeltaCents: number | null;
  discountPercent: number | null;
  startDate: Date | null;
  endDate: Date | null;
  startMinutes: number | null;
  endMinutes: number | null;
  isEnabled?: boolean;
};

export function resolveStoreNow(timezone: string): DateTime {
  const now = DateTime.now().setZone(timezone);
  return now.isValid ? now : DateTime.now().toUTC();
}

function resolveStoreCalendarDate(value: Date, zoneName: string): DateTime {
  return DateTime.fromObject(
    {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
    },
    { zone: zoneName },
  );
}

export function isDailySpecialActiveNow(
  special: DailySpecialLike,
  now: DateTime,
): boolean {
  if (special.isEnabled === false) return false;

  // Explicitly narrow zoneName so eslint never treats the external Luxon type as error-typed.
  const zoneName =
    typeof (now as unknown as { zoneName?: unknown }).zoneName === 'string'
      ? (now as unknown as { zoneName: string }).zoneName
      : 'UTC';

  // startDate/endDate are business calendar dates, not instants. Prisma stores a
  // date input as a Date, so rebuild the UTC calendar components in the store
  // timezone to avoid Toronto dates shifting to the previous evening.
  const startDate = special.startDate
    ? resolveStoreCalendarDate(special.startDate, zoneName).startOf('day')
    : null;
  const endDate = special.endDate
    ? resolveStoreCalendarDate(special.endDate, zoneName).endOf('day')
    : null;
  if (startDate && now < startDate) return false;
  if (endDate && now > endDate) return false;

  const minutes = now.hour * 60 + now.minute;
  const startMinutes =
    typeof special.startMinutes === 'number' ? special.startMinutes : null;
  const endMinutes =
    typeof special.endMinutes === 'number' ? special.endMinutes : null;
  if (startMinutes === null && endMinutes === null) return true;
  if (startMinutes !== null && endMinutes !== null) {
    if (endMinutes < startMinutes) return false;
    return minutes >= startMinutes && minutes <= endMinutes;
  }

  if (startMinutes !== null) return minutes >= startMinutes;
  if (endMinutes !== null) return minutes <= endMinutes;
  return true;
}

export function resolveEffectivePriceCents(
  basePriceCents: number,
  special: DailySpecialLike,
): number {
  return resolvePromotionLinePriceCents({
    basePriceCents,
    pricingMode: special.pricingMode,
    overridePriceCents: special.overridePriceCents,
    discountDeltaCents: special.discountDeltaCents,
    discountPercent: special.discountPercent,
  });
}
