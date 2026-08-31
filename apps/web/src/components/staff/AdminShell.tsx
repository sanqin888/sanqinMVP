'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BarChart3,
  Calculator,
  ChevronRight,
  Image,
  LogOut,
  Menu,
  MonitorSmartphone,
  PackageSearch,
  SlidersHorizontal,
  Sparkles,
  Store,
  Tags,
  TicketPercent,
  Truck,
  UserCog,
  Users,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { AdminStoreContextSelector } from '@/features/admin/brand-store/AdminStoreContextSelector';
import type { Locale } from '@/lib/i18n/locales';
import { isStaffRouteActive, type StaffNavigationMatch } from './navigation';

type AdminShellProps = {
  children: ReactNode;
  locale: Locale;
  role: 'ADMIN' | 'STAFF' | 'ACCOUNTANT';
  onLogout: () => Promise<void>;
};

type AdminNavigationItem = {
  href: string;
  labelZh: string;
  labelEn: string;
  icon: LucideIcon;
  match?: StaffNavigationMatch;
};

type AdminPageSection = {
  id: string;
  labelZh: string;
  labelEn: string;
  icon: LucideIcon;
};

type AdminCategory = {
  id: string;
  href: string;
  labelZh: string;
  labelEn: string;
  items: AdminNavigationItem[];
  matchPath?: string;
  pageSections?: AdminPageSection[];
};

function buildCategories(locale: Locale): AdminCategory[] {
  const adminRoot = `/${locale}/admin`;

  return [
    {
      id: 'brand',
      href: `${adminRoot}/brand`,
      labelZh: '品牌管理',
      labelEn: 'Brand management',
      items: [
        {
          href: `${adminRoot}/brand`,
          labelZh: '品牌设置',
          labelEn: 'Brand settings',
          icon: Tags,
        },
        {
          href: `${adminRoot}/homepage`,
          labelZh: '首页装潢',
          labelEn: 'Homepage',
          icon: Image,
        },
      ],
    },
    {
      id: 'store',
      href: `${adminRoot}/setting`,
      labelZh: '门店管理',
      labelEn: 'Store management',
      items: [
        {
          href: `${adminRoot}/setting`,
          labelZh: '门店配置',
          labelEn: 'Store settings',
          icon: Store,
        },
        {
          href: `${adminRoot}/pos-devices`,
          labelZh: 'POS 设备',
          labelEn: 'POS devices',
          icon: MonitorSmartphone,
        },
      ],
    },
    {
      id: 'catalog',
      href: `${adminRoot}/menu/categories`,
      labelZh: '菜单',
      labelEn: 'Catalog',
      matchPath: `${adminRoot}/menu`,
      items: [
        {
          href: `${adminRoot}/menu/categories`,
          labelZh: '分类管理',
          labelEn: 'Category management',
          icon: Tags,
        },
        {
          href: `${adminRoot}/menu/items`,
          labelZh: '菜品管理',
          labelEn: 'Item management',
          icon: UtensilsCrossed,
        },
        {
          href: `${adminRoot}/menu/options`,
          labelZh: '选项管理',
          labelEn: 'Options',
          icon: SlidersHorizontal,
        },
      ],
    },
    {
      id: 'marketing',
      href: `${adminRoot}/promotions`,
      labelZh: '营销',
      labelEn: 'Marketing',
      items: [
        {
          href: `${adminRoot}/promotions`,
          labelZh: '活动总览',
          labelEn: 'Overview',
          icon: Tags,
          match: 'exact',
        },
        {
          href: `${adminRoot}/promotions/specials`,
          labelZh: '商品特价',
          labelEn: 'Item specials',
          icon: Sparkles,
        },
        {
          href: `${adminRoot}/promotions/coupons`,
          labelZh: '优惠券与礼包',
          labelEn: 'Coupons & bundles',
          icon: TicketPercent,
        },
        {
          href: `${adminRoot}/promotions/automatic`,
          labelZh: '自动优惠与积分',
          labelEn: 'Automatic & loyalty',
          icon: PackageSearch,
        },
      ],
    },
    {
      id: 'members',
      href: `${adminRoot}/members`,
      labelZh: '会员',
      labelEn: 'Members',
      items: [
        {
          href: `${adminRoot}/members`,
          labelZh: '会员管理',
          labelEn: 'Member management',
          icon: Users,
        },
      ],
    },
    {
      id: 'staff',
      href: `${adminRoot}/staff`,
      labelZh: '员工',
      labelEn: 'Staff',
      items: [
        {
          href: `${adminRoot}/staff`,
          labelZh: '员工管理',
          labelEn: 'Staff management',
          icon: UserCog,
        },
      ],
    },
    {
      id: 'data',
      href: `${adminRoot}/reports`,
      labelZh: '数据',
      labelEn: 'Data',
      items: [
        {
          href: `${adminRoot}/reports`,
          labelZh: '经营报表',
          labelEn: 'Business reports',
          icon: BarChart3,
        },
        {
          href: `${adminRoot}/analytics`,
          labelZh: '行为 / 埋点分析',
          labelEn: 'Behavior analytics',
          icon: Activity,
        },
      ],
    },
    {
      id: 'channels',
      href: `${adminRoot}/ubereats`,
      labelZh: '渠道',
      labelEn: 'Channels',
      items: [
        {
          href: `${adminRoot}/ubereats`,
          labelZh: 'UberEats',
          labelEn: 'UberEats',
          icon: Truck,
        },
      ],
    },
  ];
}

function AdminBrand({ locale }: { locale: Locale }) {
  const isZh = locale === 'zh';

  return (
    <div className="flex items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#87362E] text-sm font-bold tracking-wide text-white shadow-sm">
        SQ
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-950">
          {isZh ? '三秦运营后台' : 'SanQ Operations'}
        </p>
        <p className="truncate text-xs text-slate-500">
          {isZh ? '门店管理工作台' : 'Store management console'}
        </p>
      </div>
    </div>
  );
}

function resolveActiveCategory(
  pathname: string,
  categories: AdminCategory[],
): AdminCategory {
  const fallback = categories[0];
  if (!fallback) throw new Error('Admin navigation requires at least one category.');

  return (
    categories.find((category) =>
      (category.matchPath
        ? isStaffRouteActive(pathname, category.matchPath)
        : false) ||
      category.items.some((item) =>
        isStaffRouteActive(pathname, item.href, item.match),
      ),
    ) ?? fallback
  );
}

function ContextNavigation({
  category,
  locale,
  pathname,
  onNavigate,
}: {
  category: AdminCategory;
  locale: Locale;
  pathname: string;
  onNavigate?: () => void;
}) {
  const isZh = locale === 'zh';
  const usesPageNavigation = category.items.length === 0;

  return (
    <nav
      aria-label={isZh ? `${category.labelZh}导航` : `${category.labelEn} navigation`}
      className="space-y-1"
    >
      <div className="mb-4 px-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
          {usesPageNavigation
            ? isZh
              ? '页面导航'
              : 'On this page'
            : isZh
              ? '功能菜单'
              : 'Functions'}
        </p>
        <p className="mt-1 text-base font-semibold text-slate-950">
          {isZh ? category.labelZh : category.labelEn}
        </p>
      </div>

      {usesPageNavigation
        ? category.pageSections?.map((section) => {
            const Icon = section.icon;
            return (
              <a
                key={section.id}
                href={`#${section.id}`}
                onClick={onNavigate}
                className="flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 outline-none transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-300"
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span>{isZh ? section.labelZh : section.labelEn}</span>
              </a>
            );
          })
        : category.items.map((item) => {
            const active = isStaffRouteActive(pathname, item.href, item.match);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
                className={
                  active
                    ? 'flex min-h-10 items-center gap-3 rounded-xl bg-[#87362E]/10 px-3 py-2 text-sm font-semibold text-[#762f28] outline-none ring-[#87362E]/30 focus-visible:ring-2'
                    : 'flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 outline-none transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-300'
                }
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
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

function LogoutButton({
  locale,
  onLogout,
}: {
  locale: Locale;
  onLogout: () => Promise<void>;
}) {
  const isZh = locale === 'zh';

  return (
    <button
      type="button"
      onClick={() => void onLogout()}
      className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 outline-none transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-300"
    >
      <LogOut className="size-4" aria-hidden="true" />
      <span className="hidden xl:inline">{isZh ? '退出登录' : 'Sign out'}</span>
    </button>
  );
}

export function AdminShell({ children, locale, role, onLogout }: AdminShellProps) {
  const pathname = usePathname();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const isZh = locale === 'zh';
  const categories = buildCategories(locale);
  const activeCategory = resolveActiveCategory(pathname, categories);
  const showStoreContext =
    role !== 'ACCOUNTANT' &&
    (activeCategory.id === 'catalog' ||
      (activeCategory.id === 'store' && pathname.endsWith('/setting')));

  return (
    <div data-staff-shell="admin" className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex min-h-16 items-center gap-4 px-4 sm:px-6 xl:px-8">
          <div className="shrink-0">
            <AdminBrand locale={locale} />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link
              href={`/${locale}/accounting/dashboard`}
              className="hidden min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 outline-none transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-300 sm:flex"
            >
              <Calculator className="size-4" aria-hidden="true" />
              {isZh ? '财务系统' : 'Accounting'}
            </Link>
            <LogoutButton locale={locale} onLogout={onLogout} />
            <button
              type="button"
              aria-label={isZh ? '打开当前分类导航' : 'Open section navigation'}
              aria-expanded={mobileNavigationOpen}
              aria-controls="admin-mobile-navigation"
              onClick={() => setMobileNavigationOpen(true)}
              className="flex size-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 outline-none transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-300 lg:hidden"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <nav
          aria-label={isZh ? '后台大分类' : 'Admin categories'}
          className="overflow-x-auto border-t border-slate-100 px-3 sm:px-5 xl:px-7"
        >
          <div className="flex min-w-max gap-1 py-2">
            {categories.map((category) => {
              const active = category.id === activeCategory.id;
              return (
                <Link
                  key={category.id}
                  href={category.href}
                  aria-current={active ? 'page' : undefined}
                  className={
                    active
                      ? 'rounded-xl bg-[#87362E] px-4 py-2 text-sm font-semibold text-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[#87362E]/30 focus-visible:ring-offset-2'
                      : 'rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 outline-none transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-300'
                  }
                >
                  {isZh ? category.labelZh : category.labelEn}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      {showStoreContext ? (
        <AdminStoreContextSelector
          locale={locale}
          context={activeCategory.id === 'catalog' ? 'catalog' : 'store'}
          canCreateStore={role === 'ADMIN'}
        />
      ) : null}

      <div className="lg:grid lg:grid-cols-[236px_minmax(0,1fr)]">
        <aside className="hidden border-r border-slate-200 bg-white lg:sticky lg:top-[113px] lg:block lg:h-[calc(100vh-113px)] lg:overflow-y-auto">
          <div className="p-4 xl:p-5">
            <ContextNavigation
              category={activeCategory}
              locale={locale}
              pathname={pathname}
            />
          </div>
        </aside>

        <main className="min-w-0 p-4 sm:p-6 xl:p-8">
          <div className="mx-auto w-full max-w-[1680px]">{children}</div>
        </main>
      </div>

      {mobileNavigationOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={isZh ? '关闭当前分类导航' : 'Close section navigation'}
            onClick={() => setMobileNavigationOpen(false)}
            className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
          />
          <aside
            id="admin-mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label={isZh ? '当前分类导航' : 'Section navigation'}
            className="absolute inset-y-0 left-0 flex w-[min(88vw,320px)] flex-col border-r border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <AdminBrand locale={locale} />
              <button
                type="button"
                aria-label={isZh ? '关闭导航' : 'Close navigation'}
                onClick={() => setMobileNavigationOpen(false)}
                className="flex size-10 items-center justify-center rounded-xl text-slate-500 outline-none transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-300"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <ContextNavigation
                category={activeCategory}
                locale={locale}
                pathname={pathname}
                onNavigate={() => setMobileNavigationOpen(false)}
              />
            </div>
            <div className="border-t border-slate-100 p-4 sm:hidden">
              <Link
                href={`/${locale}/accounting/dashboard`}
                className="flex min-h-11 items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
              >
                <span className="flex items-center gap-2">
                  <Calculator className="size-4" aria-hidden="true" />
                  {isZh ? '财务系统' : 'Accounting'}
                </span>
                <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
