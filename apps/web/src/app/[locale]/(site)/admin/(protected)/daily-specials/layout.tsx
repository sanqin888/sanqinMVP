import { redirect } from 'next/navigation';

type LegacyDailySpecialsLayoutProps = {
  params: Promise<{ locale: string }>;
};

export default async function LegacyDailySpecialsLayout({
  params,
}: LegacyDailySpecialsLayoutProps) {
  const { locale } = await params;
  const safeLocale = locale === 'zh' ? 'zh' : 'en';
  redirect(`/${safeLocale}/admin/promotions/specials`);
}
