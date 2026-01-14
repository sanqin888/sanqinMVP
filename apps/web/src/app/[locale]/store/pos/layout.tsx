// apps/web/src/app/[locale]/store/pos/layout.tsx
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import type { ReactNode } from 'react';
import type { Locale } from '@/lib/i18n/locales';

const SESSION_COOKIE_NAME = 'session_id';

type StaffSessionResponse = {
  userStableId?: string;
  email?: string;
  role?: string;
};

type ApiEnvelope<T> = {
  code: string;
  message?: string;
  details?: T;
};

async function getBaseUrl(): Promise<string | null> {
  const headerStore = await headers();
  const host =
    headerStore.get('x-forwarded-host') ?? headerStore.get('host');
  if (!host) return null;
  const proto = headerStore.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}

function unwrapEnvelope<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== 'object') return null;

  if ('code' in payload) {
    const env = payload as ApiEnvelope<T>;
    return (env.details ?? null) as T | null;
  }

  return payload as T;
}

async function fetchStaffSession(): Promise<StaffSessionResponse | null> {
  const baseUrl = await getBaseUrl();
  if (!baseUrl) return null;

  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ');

  const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    cache: 'no-store',
  });

  if (!res.ok) return null;

  const payload = (await res.json().catch(() => null)) as unknown;
  return unwrapEnvelope<StaffSessionResponse>(payload);
}

export default async function PosLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale: Locale = locale === 'zh' || locale === 'en' ? locale : 'en';

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) {
    return children;
  }

  const session = await fetchStaffSession();
  const role = session?.role;

  if (role !== 'ADMIN' && role !== 'STAFF') {
    redirect(`/${safeLocale}/store/pos/login`);
  }

  return children;
}
