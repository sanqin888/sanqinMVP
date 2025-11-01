export const LOCALES = ["zh", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export function isLocale(x: string): x is Locale {
  return (LOCALES as readonly string[]).includes(x);
}

export const DEFAULT_LOCALE: Locale = "en";
