'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  BookOpenCheck,
  ChevronRight,
  FileClock,
  Inbox,
  LayoutDashboard,
  MoreHorizontal,
  ReceiptText,
  Settings2,
  WalletCards,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { isStaffRouteActive, type StaffNavigationMatch } from './navigation';

type AccountingShellProps = {
  children: ReactNode;
  locale: 'zh' | 'en';
};

type AccountingNavigationItem = {
  href: string;
  labelZh: string;
  labelEn: string;
  shortZh: string;
  shortEn: string;
  icon: LucideIcon;
  match?: StaffNavigationMatch;
};

function buildNavigation(locale: 'zh' | 'en'): AccountingNavigationItem[] {
  const root = `/${locale}/accounting`;

  return [
    {
      href: `${root}/dashboard`,
      labelZh: '财务首页',
      labelEn: 'Dashboard',
      shortZh: '首页',
      shortEn: 'Home',
      icon: LayoutDashboard,
    },
    {
      href: `${root}/inbox`,
      labelZh: '财务收件箱',
      labelEn: 'Inbox',
      shortZh: '收件箱',
      shortEn: 'Inbox',
      icon: Inbox,
    },
    {
      href: `${root}/expenses`,
      labelZh: '支出',
      labelEn: 'Expenses',
      shortZh: '支出',
      shortEn: 'Expenses',
      icon: ReceiptText,
    },
    {
      href: `${root}/sales`,
      labelZh: '销售',
      labelEn: 'Sales',
      shortZh: '销售',
      shortEn: 'Sales',
      icon: WalletCards,
    },
    {
      href: `${root}/reconciliation`,
      labelZh: '对账',
      labelEn: 'Reconciliation',
      shortZh: '对账',
      shortEn: 'Reconcile',
      icon: BookOpenCheck,
    },
    {
      href: `${root}/reports`,
      labelZh: '报表',
      labelEn: 'Reports',
      shortZh: '报表',
      shortEn: 'Reports',
      icon: BarChart3,
    },
    {
      href: `${root}/settings`,
      labelZh: '设置与月结',
      labelEn: 'Settings & close',
      shortZh: '设置',
      shortEn: 'Settings',
      icon: Settings2,
    },
  ];
}

function AccountingBrand({ locale }: { locale: 'zh' | 'en' }) {
  const isZh = locale === 'zh';

  return (
    <div className="flex items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#87362E] text-sm font-bold tracking-wide text-white shadow-sm">
        SQ
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-950">
          {isZh ? '三秦财务' : 'SanQ Accounting'}
        </p>
        <p className="truncate text-xs text-slate-500">
          {isZh ? '移动优先财务工作台' : 'Mobile-first finance workspace'}
        </p>
      </div>
    </div>
  );
}

function DesktopNavigation({
  locale,
  pathname,
}: {
  locale: 'zh' | 'en';
  pathname: string;
}) {
  const isZh = locale === 'zh';
  const items = buildNavigation(locale);

  return (
    <nav aria-label={isZh ? '财务导航' : 'Accounting navigation'} className="space-y-1">
      {items.map((item) => {
        const active = isStaffRouteActive(pathname, item.href, item.match);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'flex min-h-11 items-center gap-3 rounded-xl bg-[#87362E]/10 px-3 py-2.5 text-sm font-semibold text-[#762f28] outline-none focus-visible:ring-2 focus-visible:ring-[#87362E]/30'
                : 'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 outline-none transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-300'
            }
          >
            <Icon className="size-4.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">
              {isZh ? item.labelZh : item.labelEn}
            </span>
            {active ? <ChevronRight className="size-4 shrink-0" aria-hidden="true" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function AccountingShell({ children, locale }: AccountingShellProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const isZh = locale === 'zh';
  const items = buildNavigation(locale);
  const primaryItems = items.filter((item) =>
    ['dashboard', 'inbox', 'expenses', 'reconciliation'].some((segment) =>
      item.href.endsWith(`/${segment}`),
    ),
  );
  const overflowItems = items.filter((item) => !primaryItems.includes(item));
  const overflowActive = overflowItems.some((item) =>
    isStaffRouteActive(pathname, item.href, item.match),
  );

  return (
    <div data-staff-shell="accounting" className="min-h-screen bg-slate-50 text-slate-950">
      <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="hidden border-r border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
          <div className="border-b border-slate-100 p-5">
            <AccountingBrand locale={locale} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
            <DesktopNavigation locale={locale} pathname={pathname} />
          </div>
          <div className="border-t border-slate-100 p-4">
            <Link
              href={`/${locale}/admin`}
              className="flex min-h-10 items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 outline-none transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              <span>{isZh ? '返回运营后台' : 'Back to operations'}</span>
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
            <AccountingBrand locale={locale} />
          </header>

          <main className="min-w-0 px-4 py-5 pb-28 sm:px-6 sm:py-6 lg:px-8 lg:py-8 lg:pb-8">
            <div className="mx-auto w-full max-w-[1440px]">{children}</div>
          </main>
        </div>
      </div>

      <nav
        aria-label={isZh ? '财务快捷导航' : 'Accounting quick navigation'}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden"
      >
        <div className="mx-auto grid max-w-xl grid-cols-5 gap-1 py-2">
          {primaryItems.map((item) => {
            const active = isStaffRouteActive(pathname, item.href, item.match);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl bg-[#87362E]/10 px-1 py-1.5 text-[11px] font-semibold text-[#762f28] outline-none focus-visible:ring-2 focus-visible:ring-[#87362E]/30'
                    : 'flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[11px] font-medium text-slate-500 outline-none transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-300'
                }
              >
                <Icon className="size-5" aria-hidden="true" />
                <span className="max-w-full truncate">
                  {isZh ? item.shortZh : item.shortEn}
                </span>
              </Link>
            );
          })}

          <button
            type="button"
            aria-label={isZh ? '更多财务功能' : 'More accounting tools'}
            aria-expanded={moreOpen}
            aria-controls="accounting-more-sheet"
            onClick={() => setMoreOpen(true)}
            className={
              overflowActive
                ? 'flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl bg-[#87362E]/10 px-1 py-1.5 text-[11px] font-semibold text-[#762f28] outline-none focus-visible:ring-2 focus-visible:ring-[#87362E]/30'
                : 'flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[11px] font-medium text-slate-500 outline-none transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-300'
            }
          >
            <MoreHorizontal className="size-5" aria-hidden="true" />
            <span>{isZh ? '更多' : 'More'}</span>
          </button>
        </div>
      </nav>

      {moreOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={isZh ? '关闭更多财务功能' : 'Close more accounting tools'}
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
          />
          <section
            id="accounting-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={isZh ? '更多财务功能' : 'More accounting tools'}
            className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-slate-200 bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 shadow-2xl"
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" aria-hidden="true" />
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  {isZh ? '更多财务功能' : 'More accounting tools'}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {isZh ? '报表、销售和财务设置' : 'Sales, reports and accounting settings'}
                </p>
              </div>
              <button
                type="button"
                aria-label={isZh ? '关闭' : 'Close'}
                onClick={() => setMoreOpen(false)}
                className="flex size-10 items-center justify-center rounded-xl text-slate-500 outline-none transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-300"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-2">
              {overflowItems.map((item) => {
                const active = isStaffRouteActive(pathname, item.href, item.match);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setMoreOpen(false)}
                    className={
                      active
                        ? 'flex min-h-12 items-center gap-3 rounded-2xl bg-[#87362E]/10 px-4 py-3 text-sm font-semibold text-[#762f28] outline-none focus-visible:ring-2 focus-visible:ring-[#87362E]/30'
                        : 'flex min-h-12 items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 outline-none transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-300'
                    }
                  >
                    <Icon className="size-5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">
                      {isZh ? item.labelZh : item.labelEn}
                    </span>
                    <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
                  </Link>
                );
              })}

              <Link
                href={`/${locale}/admin`}
                onClick={() => setMoreOpen(false)}
                className="flex min-h-12 items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 outline-none transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-300"
              >
                <FileClock className="size-5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">
                  {isZh ? '返回运营后台' : 'Back to operations'}
                </span>
                <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
              </Link>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
