'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/auth-session';
import { addLocaleToPath, removeLeadingLocale } from '@/lib/i18n/path';

type CustomerLocalePreferenceSyncProps = {
  locale: 'zh' | 'en';
};

type CustomerLocale = 'zh' | 'en';

function readLocaleCookie(name: string): CustomerLocale | null {
  const value = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  return value === 'zh' || value === 'en' ? value : null;
}

export default function CustomerLocalePreferenceSync({
  locale,
}: CustomerLocalePreferenceSyncProps) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const cleanPath = removeLeadingLocale(pathname || '/');
    const query = searchParams.toString();

    const redirectToLocale = (nextLocale: CustomerLocale) => {
      const nextPath = addLocaleToPath(nextLocale, cleanPath);
      document.cookie = `locale=${nextLocale}; path=/; max-age=${60 * 60 * 24 * 365}`;
      router.replace(query ? `${nextPath}?${query}` : nextPath);
    };

    let manualLocale = readLocaleCookie('preferred_locale');

    // One-time compatibility with the previous client-side preference key.
    // New selections are persisted in preferred_locale so middleware can honor them server-side.
    if (!manualLocale) {
      try {
        const legacyLocale = localStorage.getItem('preferred-locale');
        if (legacyLocale === 'zh' || legacyLocale === 'en') {
          manualLocale = legacyLocale;
          document.cookie = `preferred_locale=${legacyLocale}; path=/; max-age=${60 * 60 * 24 * 365}`;
        }
      } catch {}
    }

    // Highest priority: the language explicitly chosen from the site header on this device.
    if (manualLocale) {
      if (manualLocale !== locale) redirectToLocale(manualLocale);
      return;
    }

    if (status !== 'authenticated') return;

    const user = session?.user;
    if (!user || user.role !== 'CUSTOMER') return;

    // Second priority: the signed-in member's saved language preference.
    const memberLocale = user.language;
    if (!memberLocale || memberLocale === locale) return;
    redirectToLocale(memberLocale);
  }, [locale, pathname, router, searchParams, session, status]);

  return null;
}
