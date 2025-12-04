// apps/web/src/lib/i18n/locales.ts

export const LOCALES = ["en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];
export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" &&
    (LOCALES as readonly string[]).includes(value)
  );
}

export const DEFAULT_LOCALE: Locale = "en";
