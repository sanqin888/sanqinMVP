import type { Locale } from '@/lib/i18n/locales';
import { LegacyStaffLoginRetired } from '@/components/staff/LegacyStaffLoginRetired';

export default async function AccountingLegacyLoginRetired({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale: Locale = locale === 'zh' || locale === 'en' ? locale : 'en';

  return <LegacyStaffLoginRetired locale={safeLocale} appName="Accounting" />;
}
