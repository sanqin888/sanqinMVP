// apps/web/src/app/[locale]/admin/layout.tsx
'use client';

import Link from 'next/link';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import type { Locale } from '@/lib/order/shared';
import { ReactNode, useEffect, useMemo } from 'react';

const ADMIN_EMAILS: string[] = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? '')
  .split(',')
  .map((v) => v.trim().toLowerCase())
  .filter(Boolean);

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { locale } = useParams<{ locale: Locale }>();
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();

  const isAdmin = useMemo(() => {
    const email = session?.user?.email?.toLowerCase() ?? '';
    if (!email) return false;
    return ADMIN_EMAILS.includes(email);
  }, [session]);

  useEffect(() => {
    if (status === 'loading') return;
    if (!isAdmin) {
      router.replace(`/${locale}`);
    }
  }, [status, isAdmin, router, locale]);

  if (status === 'loading') {
    return <div className="p-4">Loading...</div>;
  }

  if (!isAdmin) {
    return null;
  }

  // ✅ 选项管理页路由（如不同请改这里）
  const optionsHref = `/${locale}/admin/menu/options`;

  const navItems = [
    { href: `/${locale}/admin`, labelZh: '总览' },
    { href: `/${locale}/admin/setting`, labelZh: '门店信息设置' },
    { href: `/${locale}/admin/menu`, labelZh: '菜单管理' },
    // ✅ 新增：选项管理（放在红圈位置的左侧导航里）
    { href: optionsHref, labelZh: '选项管理' },
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
