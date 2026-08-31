import { notFound } from 'next/navigation';
import { BrandSettingsPageClient } from '@/features/admin/brand-store/BrandSettingsPageClient';
import { isLocale } from '@/lib/i18n/locales';

export default async function AdminBrandPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <BrandSettingsPageClient locale={locale} />;
}
