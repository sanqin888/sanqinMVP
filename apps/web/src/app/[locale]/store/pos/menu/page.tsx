// apps/web/src/app/[locale]/store/pos/menu/page.tsx
'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { Locale } from '@/lib/order/shared';

const COPY = {
  zh: {
    title: 'POS 菜单管理',
    subtitle: '在此快速管理菜品、选项组与选项的上下架（当日下架/永久下架/上架）。',
    backToPos: '返回 POS 点单',
    sections: {
      items: {
        title: '菜品上下架',
        desc: '管理菜品的售卖状态，支持当日下架、永久下架与恢复上架。',
        action: '进入菜品管理',
        href: '/admin/menu',
      },
      groups: {
        title: '选项组上下架',
        desc: '管理选项组模板的售卖状态，控制是否可被菜品绑定。',
        action: '进入选项组管理',
        href: '/admin/menu/options',
      },
      options: {
        title: '选项上下架',
        desc: '管理选项的售卖状态，支持当日下架、永久下架与恢复上架。',
        action: '进入选项管理',
        href: '/admin/menu/options',
      },
    },
  },
  en: {
    title: 'POS Menu Management',
    subtitle:
      'Quickly manage availability for menu items, option groups, and options (off today, off permanently, on).',
    backToPos: 'Back to POS ordering',
    sections: {
      items: {
        title: 'Menu item availability',
        desc: 'Manage item availability with off-today, permanent off, and on.',
        action: 'Manage items',
        href: '/admin/menu',
      },
      groups: {
        title: 'Option group availability',
        desc: 'Manage option group templates and control their availability.',
        action: 'Manage option groups',
        href: '/admin/menu/options',
      },
      options: {
        title: 'Option availability',
        desc: 'Manage option availability with off-today, permanent off, and on.',
        action: 'Manage options',
        href: '/admin/menu/options',
      },
    },
  },
} as const;

export default function PosMenuManagementPage() {
  const { locale } = useParams<{ locale?: string }>();
  const safeLocale: Locale = locale === 'zh' ? 'zh' : 'en';
  const copy = COPY[safeLocale];

  const sections = [
    copy.sections.items,
    copy.sections.groups,
    copy.sections.options,
  ];

  return (
    <main className="min-h-screen bg-slate-900 text-slate-50">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">{copy.title}</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              {copy.subtitle}
            </p>
          </div>
          <Link
            href={`/${safeLocale}/store/pos`}
            className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:border-slate-500"
          >
            {copy.backToPos}
          </Link>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {sections.map((section) => (
            <div
              key={section.title}
              className="flex h-full flex-col justify-between rounded-3xl border border-slate-700 bg-slate-800/80 p-5"
            >
              <div>
                <h2 className="text-lg font-semibold">{section.title}</h2>
                <p className="mt-2 text-sm text-slate-300">{section.desc}</p>
              </div>
              <Link
                href={`/${safeLocale}${section.href}`}
                className="mt-6 inline-flex items-center justify-center rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-emerald-400"
              >
                {section.action}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
