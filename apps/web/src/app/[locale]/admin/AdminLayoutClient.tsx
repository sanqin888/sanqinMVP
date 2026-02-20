// apps/web/src/app/[locale]/admin/AdminLayoutClient.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Locale } from '@/lib/i18n/locales';
import type { ReactNode } from 'react';

type AdminLayoutClientProps = {
  children: ReactNode;
  locale: Locale;
};

export default function AdminLayoutClient({
  children,
  locale,
}: AdminLayoutClientProps) {
  const pathname = usePathname();

  const optionsHref = `/${locale}/admin/menu/options`;

  const navItems = [
    { href: `/${locale}/admin`, labelZh: '总览' },
    { href: `/${locale}/admin/setting`, labelZh: '门店信息设置' },
    { href: `/${locale}/admin/menu`, labelZh: '菜单管理' },
    { href: optionsHref, labelZh: '选项管理' },
    { href: `/${locale}/admin/daily-specials`, labelZh: '每日特价管理' },
    { href: `/${locale}/admin/coupons`, labelZh: '优惠券管理' },
    { href: `/${locale}/admin/members`, labelZh: '会员管理' },
    { href: `/${locale}/admin/staff`, labelZh: '员工管理' },
    { href: `/${locale}/admin/pos-devices`, labelZh: 'POS 设备管理' },
    { href: `/${locale}/admin/reports`, labelZh: '报表页' },
    { href: `/${locale}/accounting/dashboard`, labelZh: '财务系统' },
  ];

  function isActive(href: string): boolean {
    if (href === `/${locale}/admin`) return pathname === href;
    return pathname.startsWith(href);
  }

  async function handleLogout() {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      window.location.href = `/${locale}/admin/login`;
    }
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 border-r p-4 flex flex-col gap-2">
        <div className="mb-4 flex items-center justify-between">
          <div className="font-bold text-lg">Sanqin 后台</div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
          >
            退出登录
          </button>
        </div>

        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`block px-3 py-2 rounded-md ${
              isActive(item.href)
                ? 'bg-gray-200 font-semibold'
                : 'hover:bg-gray-100'
            }`}
          >
            {item.labelZh}
          </Link>
        ))}
      </aside>

      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
