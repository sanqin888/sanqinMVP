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
      // 不是 admin 的话，统一踢回菜单页
      router.replace(`/${locale}`);
    }
  }, [status, isAdmin, router, locale]);

  if (status === 'loading') {
    return <div className="p-4">Loading...</div>;
  }

  if (!isAdmin) {
    // 正在重定向时不闪一下内容
    return null;
  }

  const navItems = [
    { href: `/${locale}/admin`, labelZh: '总览' },
    { href: `/${locale}/admin/hours`, labelZh: '营业时间' },
    { href: `/${locale}/admin/menu`, labelZh: '菜单管理' },
  ];

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 border-r p-4 flex flex-col gap-2">
        <div className="font-bold text-lg mb-4">Sanqin 后台</div>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`block px-3 py-2 rounded-md ${
              pathname.startsWith(item.href)
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
