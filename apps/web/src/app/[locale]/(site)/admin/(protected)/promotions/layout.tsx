import Link from 'next/link';
import type { ReactNode } from 'react';

type PromotionsLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function PromotionsLayout({
  children,
  params,
}: PromotionsLayoutProps) {
  const { locale } = await params;
  const safeLocale = locale === 'zh' ? 'zh' : 'en';
  const baseHref = `/${safeLocale}/admin/promotions`;
  const isZh = safeLocale === 'zh';

  const navItems = [
    { href: baseHref, label: isZh ? '活动总览' : 'Overview' },
    {
      href: `${baseHref}/specials`,
      label: isZh ? '商品特价' : 'Item specials',
    },
    {
      href: `${baseHref}/coupons`,
      label: isZh ? '优惠券与礼包' : 'Coupons & bundles',
    },
  ];

  return (
    <div className="space-y-4">
      <nav className="mx-auto flex max-w-6xl flex-wrap gap-2 px-6 pt-4">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
