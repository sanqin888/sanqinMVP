import { redirect } from 'next/navigation';

export default async function LegacyAccountingTransactionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = locale === 'zh' || locale === 'en' ? locale : 'en';
  redirect(`/${safeLocale}/accounting/expenses`);
}
