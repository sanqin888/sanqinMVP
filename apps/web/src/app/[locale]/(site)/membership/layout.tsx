'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export default function MembershipLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const match = pathname.match(/^\/(zh|en)\/membership\/?$/);
  const locale = match?.[1];

  return (
    <>
      {children}
      {locale ? (
        <Link
          href={`/${locale}/promotions`}
          className="fixed bottom-5 right-5 z-40 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg hover:bg-amber-400"
        >
          {locale === 'zh' ? '领取优惠' : 'Claim offers'}
        </Link>
      ) : null}
    </>
  );
}
