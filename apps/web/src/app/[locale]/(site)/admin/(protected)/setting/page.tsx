import { notFound } from 'next/navigation';
import { StoreSettingsPageClient } from '@/features/admin/brand-store/StoreSettingsPageClient';
import { isLocale } from '@/lib/i18n/locales';

export default async function AdminStoreSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <StoreSettingsPageClient locale={locale} />;
}
