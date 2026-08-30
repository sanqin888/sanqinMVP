import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { serverApiFetch } from '@/server/api';

type Session = {
  role?: string;
  requiresTwoFactor?: boolean;
};

async function getSession(): Promise<Session | null> {
  try {
    return await serverApiFetch<Session>('/auth/me', {
      forwardCookies: true,
    });
  } catch {
    return null;
  }
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
    redirect(`/${safeLocale}/accounting/login`);
  }

  const isZh = safeLocale === 'zh';
  const nav = [
    { href: `/${safeLocale}/accounting/dashboard`, label: isZh ? '财务首页' : 'Dashboard' },
    { href: `/${safeLocale}/accounting/inbox`, label: isZh ? '财务收件箱' : 'Inbox' },
    { href: `/${safeLocale}/accounting/expenses`, label: isZh ? '支出' : 'Expenses' },
    { href: `/${safeLocale}/accounting/sales`, label: isZh ? '销售' : 'Sales' },
    { href: `/${safeLocale}/accounting/reconciliation`, label: isZh ? '对账' : 'Reconciliation' },
    { href: `/${safeLocale}/accounting/reports`, label: isZh ? '报表' : 'Reports' },
    { href: `/${safeLocale}/accounting/settings`, label: isZh ? '设置与月结' : 'Settings & close' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-7xl gap-6 px-6 py-6">
        <aside className="w-52 shrink-0 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold">
            {isZh ? '财务系统' : 'Accounting'}
          </h2>
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
