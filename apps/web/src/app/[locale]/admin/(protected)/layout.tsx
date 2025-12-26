// apps/web/src/app/[locale]/admin/layout.tsx
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import type { ReactNode } from 'react';
import type { Locale } from '@/lib/order/shared';
import AdminLayoutClient from '../AdminLayoutClient';

type AdminSessionResponse = {
  userStableId?: string;
  email?: string;
  role?: string;
};

async function getBaseUrl(): Promise<string | null> {
  const headerStore = await headers();
  const host =
    headerStore.get('x-forwarded-host') ?? headerStore.get('host');
  if (!host) return null;
  const proto = headerStore.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}

async function fetchAdminSession(): Promise<AdminSessionResponse | null> {
  const baseUrl = await getBaseUrl();
  if (!baseUrl) return null;
  const cookieHeader = cookies()
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ');

  const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    cache: 'no-store',
  });

  if (!res.ok) return null;
  return (await res.json()) as AdminSessionResponse;
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
  if (role !== 'ADMIN' && role !== 'STAFF') {
    redirect(`/${safeLocale}/admin/login`);
  }

  return <AdminLayoutClient locale={safeLocale}>{children}</AdminLayoutClient>;
}
