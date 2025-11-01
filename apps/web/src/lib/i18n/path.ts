import { LOCALES, type Locale } from "./locales";

export function addLocaleToPath(locale: Locale, path: string) {
  if (!path.startsWith("/")) path = `/${path}`;
  // 去掉已有前缀再加
  path = removeLeadingLocale(path);
  return `/${locale}${path}`;
}

export function removeLeadingLocale(path: string) {
  return path.replace(/^\/(zh|en)(?=\/|$)/, "");
}

export function localeAlternates(current: Locale) {
  // 你也可以在这里构造更完整的多页面映射
  const languages: Record<string, string> = {};
  for (const l of LOCALES) {
    languages[l === "zh" ? "zh-Hans" : "en"] = `/${l}`;
  }
  return {
    alternates: {
      languages,
      canonical: `/${current}`,
      // 主页可以考虑 x-default 指向根，让 middleware 决定
      canonicalUrl: `/${current}`,
    },
  };
}
