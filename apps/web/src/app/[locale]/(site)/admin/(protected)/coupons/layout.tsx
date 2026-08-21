import { redirect } from 'next/navigation';

type LegacyCouponsLayoutProps = {
  params: Promise<{ locale: string }>;
};

export default async function LegacyCouponsLayout({
  params,
}: LegacyCouponsLayoutProps) {
  const { locale } = await params;
  const safeLocale = locale === 'zh' ? 'zh' : 'en';
  redirect(`/${safeLocale}/admin/promotions/coupons`);
}
