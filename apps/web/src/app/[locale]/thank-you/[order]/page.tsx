//Users/apple/sanqinMVP/apps/web/src/app/[locale]/thank-you/[order]/page.tsx

import Link from "next/link";
import type { Locale } from "@/lib/i18n/locales";
import { UI_STRINGS } from "@/lib/i18n/dictionaries";
import { ClearCartOnMount } from "./ClearCartOnMount";
import { OrderSummaryClient } from "./OrderSummaryClient";

type PageParams = {
  locale?: string;
  order?: string;
};

// ✅ 注意：params 现在是 Promise
type PageProps = {
  params: Promise<PageParams>;
};

const SUPPORTED: Locale[] = ["zh", "en"];

export default async function ThankYouPage({ params }: PageProps) {
  // ✅ 先 await，再拿 locale / order
  const { locale: rawLocale, order: orderParam } = await params;

const locale = (SUPPORTED.includes(rawLocale as Locale)
  ? (rawLocale as Locale)
  : "en") as Locale;

// 这里直接从 UI_STRINGS 拿 thankYou 文案
const t = UI_STRINGS[locale].thankYou;
  const order = orderParam ?? "";
  const alt = locale === "zh" ? "en" : "zh";

  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-10">
      {/* 支付成功页挂载时清空购物车（localStorage） */}
      <ClearCartOnMount />

      <div className="flex items-center justify-between mb-6">
        <div className="text-sm text-slate-500">{t.brand}</div>
        <Link
          href={`/${alt}/thank-you/${order}`}
          className="rounded-full border px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          {t.switchLabel}
        </Link>
      </div>

      <div className="rounded-3xl bg-slate-50 p-6 sm:p-10 shadow-sm">
        <h1 className="text-2xl sm:text-3xl font-semibold text-center mb-3">
          {t.title}
        </h1>
        <p className="text-center text-slate-600 mb-8">{t.intro}</p>

        {/* ✅ 新增：订单小结（从后端拉菜品/金额清单） */}
        {order ? (
          <OrderSummaryClient orderStableId={order} locale={locale} />
        ) : null}

        <div className="mt-8 space-y-3 text-center">
          <p className="text-sm text-slate-600">{t.contact}</p>
          <Link
            href={`/${locale}`}
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            {t.backCta}
          </Link>
        </div>
      </div>
    </main>
  );
}
