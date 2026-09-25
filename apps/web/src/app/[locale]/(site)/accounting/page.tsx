import { redirect } from 'next/navigation';
import type { Locale } from '@/lib/i18n/locales';

export default async function AccountingRootPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale: Locale = locale === 'zh' || locale === 'en' ? locale : 'en';

  redirect(`/${safeLocale}/accounting/dashboard`);
}
