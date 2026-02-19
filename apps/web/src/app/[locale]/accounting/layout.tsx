import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import type { ReactNode } from 'react';
import Link from 'next/link';

type Session = {
  role?: string;
  requiresTwoFactor?: boolean;
};

type ApiEnvelope<T> = { code: string; details?: T };

function unwrap<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== 'object') return null;
  if ('code' in payload) {
    return ((payload as ApiEnvelope<T>).details ?? null) as T | null;
  }
  return payload as T;
}

async function getBaseUrl(): Promise<string | null> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return null;
  const proto = h.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}

async function getSession(): Promise<Session | null> {
  const base = await getBaseUrl();
  if (!base) return null;
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ');

  const res = await fetch(`${base}/api/v1/auth/me`, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    cache: 'no-store',
  });

  if (!res.ok) return null;
  return unwrap<Session>(await res.json().catch(() => null));
}

export default async function AccountingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = locale === 'zh' || locale === 'en' ? locale : 'en';
  const session = await getSession();
  const role = session?.role;

  if (role !== 'ADMIN' && role !== 'ACCOUNTANT') {
    redirect(`/${safeLocale}/admin/login`);
  }

  if (session?.requiresTwoFactor) {
    redirect(`/${safeLocale}/admin/2fa`);
  }

  const nav = [
    { href: `/${safeLocale}/accounting/dashboard`, label: '财务看板' },
    { href: `/${safeLocale}/accounting/transactions`, label: '流水管理' },
    { href: `/${safeLocale}/accounting/reports`, label: 'P&L 报表' },
    { href: `/${safeLocale}/admin`, label: '返回后台首页' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-7xl gap-6 px-6 py-6">
        <aside className="w-52 shrink-0 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold">财务系统</h2>
          <div className="flex flex-col gap-2 text-sm">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-md px-2 py-1 hover:bg-slate-100">
                {item.label}
              </Link>
            ))}
          </div>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
