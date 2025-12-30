// apps/web/src/app/[locale]/admin/AdminLayoutClient.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Locale } from '@/lib/order/shared';
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

  // ✅ 选项管理页路由（如不同请改这里）
  const optionsHref = `/${locale}/admin/menu/options`;

  const navItems = [
    { href: `/${locale}/admin`, labelZh: '总览' },
    { href: `/${locale}/admin/setting`, labelZh: '门店信息设置' },
    { href: `/${locale}/admin/menu`, labelZh: '菜单管理' },
    // ✅ 新增：选项管理（放在红圈位置的左侧导航里）
    { href: optionsHref, labelZh: '选项管理' },
    { href: `/${locale}/admin/staff`, labelZh: '员工管理' },
  ];

  function isActive(href: string): boolean {
    // 总览只在完全匹配时高亮，否则 /admin 会把所有子路由都“吃掉”
    if (href === `/${locale}/admin`) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 border-r p-4 flex flex-col gap-2">
        <div className="font-bold text-lg mb-4">Sanqin 后台</div>

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
