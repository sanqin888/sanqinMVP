import { DateTime } from 'luxon';
import { SpecialPricingMode } from '@prisma/client';

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

export function isDailySpecialActiveNow(
  special: DailySpecialLike,
  now: DateTime,
): boolean {
  if (special.isEnabled === false) return false;

  // 显式收敛为 string，避免 eslint 把 now.zoneName 判成 error typed 后传参触发 no-unsafe-argument
  const zoneName =
    typeof (now as unknown as { zoneName?: unknown }).zoneName === 'string'
      ? (now as unknown as { zoneName: string }).zoneName
      : 'UTC';

   const startDate = special.startDate
    ? DateTime.fromJSDate(special.startDate).setZone(zoneName)
     : null;
   const endDate = special.endDate
    ? DateTime.fromJSDate(special.endDate).setZone(zoneName)
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
  let effective = basePriceCents;

  switch (special.pricingMode) {
    case SpecialPricingMode.OVERRIDE_PRICE: {
      if (typeof special.overridePriceCents === 'number') {
        effective = special.overridePriceCents;
      }
      break;
    }
    case SpecialPricingMode.DISCOUNT_DELTA: {
      if (typeof special.discountDeltaCents === 'number') {
        effective = basePriceCents - special.discountDeltaCents;
      }
      break;
    }
    case SpecialPricingMode.DISCOUNT_PERCENT: {
      if (typeof special.discountPercent === 'number') {
        const percent = special.discountPercent;
        effective = Math.round((basePriceCents * (100 - percent)) / 100);
      }
      break;
    }
    default:
      break;
  }

  if (!Number.isFinite(effective)) return basePriceCents;
  return Math.max(0, Math.min(basePriceCents, Math.round(effective)));
}
