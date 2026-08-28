import type { Locale } from './locales';

type WeightedLanguage = {
  tag: string;
  quality: number;
  order: number;
};

export function resolveLocalePreference(input: {
  manualLocale?: string | null;
  memberLocale?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (input.manualLocale === 'zh' || input.manualLocale === 'en') {
    return input.manualLocale;
  }
  if (input.memberLocale === 'zh' || input.memberLocale === 'en') {
    return input.memberLocale;
  }
  return pickSupportedLocaleFromAcceptLanguage(input.acceptLanguage);
}

export function pickSupportedLocaleFromAcceptLanguage(
  acceptLanguage: string | null | undefined,
): Locale {
  if (!acceptLanguage) return 'en';

  const weighted: WeightedLanguage[] = acceptLanguage
    .split(',')
    .map((part, order) => {
      const [rawTag, ...params] = part.trim().split(';');
      let quality = 1;
      for (const param of params) {
        const match = /^q=([0-9.]+)$/i.exec(param.trim());
        if (!match) continue;
        const parsed = Number(match[1]);
        if (Number.isFinite(parsed)) quality = parsed;
      }
      return {
        tag: rawTag.trim().toLowerCase(),
        quality,
        order,
      };
    })
    .filter((entry) => entry.tag && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.order - b.order);

  for (const entry of weighted) {
    if (entry.tag === 'zh' || entry.tag.startsWith('zh-')) return 'zh';
    if (entry.tag === 'en' || entry.tag.startsWith('en-')) return 'en';
  }

  return 'en';
}
