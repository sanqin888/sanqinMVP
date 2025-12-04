// apps/web/src/lib/i18n/path.ts
import { LOCALES, type Locale } from "./locales";

export function removeLeadingLocale(path: string) {
  return path.replace(/^\/(zh|en)(?=\/|$)/, "");
}

export function addLocaleToPath(locale: Locale, path: string) {
  if (!path.startsWith("/")) path = `/${path}`;
  // 去掉已有前缀再加
  path = removeLeadingLocale(path);
  return `/${locale}${path}`;
}

/**
 * 用于 <head> 里的 alternate 链接
 */
export function localeAlternates(current: Locale) {
  const languages: Record<string, string> = {};
  for (const l of LOCALES) {
    languages[l === "zh" ? "zh-Hans" : "en"] = `/${l}`;
  }
  return {
    alternates: {
      languages,
      canonical: `/${current}`,
      canonicalUrl: `/${current}`,
    },
  };
}
