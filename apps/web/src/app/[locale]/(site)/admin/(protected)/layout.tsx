// apps/web/src/app/[locale]/admin/(protected)/layout.tsx
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import type { Locale } from '@/lib/i18n/locales';
import { serverApiFetch } from '@/server/api';
import AdminLayoutClient from '../AdminLayoutClient';

type AdminSessionResponse = {
  userStableId?: string;
  email?: string;
  role?: string;
  requiresTwoFactor?: boolean;
};

async function fetchAdminSession(): Promise<AdminSessionResponse | null> {
  try {
    return await serverApiFetch<AdminSessionResponse>('/auth/me', {
      forwardCookies: true,
    });
  } catch {
    return null;
  }
}

export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale: Locale = locale === 'zh' || locale === 'en' ? locale : 'en';

  const session = await fetchAdminSession();
  const role = session?.role;

  if (role !== 'ADMIN' && role !== 'STAFF' && role !== 'ACCOUNTANT') {
    redirect(`/${safeLocale}/admin/login`);
  }

  return <AdminLayoutClient locale={safeLocale}>{children}</AdminLayoutClient>;
}
