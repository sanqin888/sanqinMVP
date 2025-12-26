// apps/web/src/app/[locale]/admin/layout.tsx
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import type { Locale } from '@/lib/order/shared';
import { authOptions } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin-access';
import AdminLayoutClient from './AdminLayoutClient';

export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale: Locale = locale === 'zh' || locale === 'en' ? locale : 'en';
  const session = await getServerSession(authOptions);
  const email =
    typeof session?.user?.email === 'string' ? session.user.email : undefined;
  const role =
    typeof (session?.user as { role?: string } | undefined)?.role === 'string'
      ? (session?.user as { role?: string }).role
      : undefined;

  const isAdmin = role === 'ADMIN' && isAdminEmail(email);

  if (!isAdmin) {
    redirect(`/${safeLocale}`);
  }

  return <AdminLayoutClient locale={safeLocale}>{children}</AdminLayoutClient>;
}
