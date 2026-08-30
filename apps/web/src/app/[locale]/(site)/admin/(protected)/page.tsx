import { redirect } from 'next/navigation';

export default async function AdminRootPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = locale === 'zh' ? 'zh' : 'en';

  redirect(`/${safeLocale}/admin/brand`);
}
