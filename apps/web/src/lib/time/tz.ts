//apps/web/src/lib/time/tz.ts
import { DateTime } from "luxon";

type StoreTimeLocale = "zh" | "en";
export function ymdInTimeZone(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const y = parts.find((p) => p.type === "year")?.value ?? "0000";
    const m = parts.find((p) => p.type === "month")?.value ?? "01";
    const d = parts.find((p) => p.type === "day")?.value ?? "01";
    return `${y}-${m}-${d}`;
  } catch {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
}
export function parseBackendDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value !== "string") return new Date(NaN);

  const trimmed = value.trim();
  if (!trimmed) return new Date(NaN);

  // 只要字符串里已经带 Z 或 ±hh:mm/±hhmm，就认为它自带时区
  const hasTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed);
  return new Date(hasTimezone ? trimmed : `${trimmed}Z`);
}

export function parseBackendDateMs(value: unknown): number {
  const d = parseBackendDate(value);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : Date.now();
}

export function formatStoreTime(
  isoWithOffset: string,
  timeZone: string,
  locale: StoreTimeLocale,
): string {
  const base = DateTime.fromISO(isoWithOffset, { setZone: true });
  const zoned = timeZone ? base.setZone(timeZone) : base;

  if (!zoned.isValid) {
    return isoWithOffset;
  }

  const format = locale === "zh" ? "LLL d HH:mm" : "LLL d, HH:mm";
  return zoned.setLocale(locale).toFormat(format);
}
