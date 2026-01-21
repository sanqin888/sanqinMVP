//Users/apple/sanqinMVP/apps/web/src/app/[locale]/thank-you/[order]/page.tsx
import type { Locale } from "@/lib/i18n/locales";
import { UI_STRINGS } from "@/lib/i18n/dictionaries";
import { ClearCartOnMount } from "./ClearCartOnMount";
import { OrderSummaryClient } from "./OrderSummaryClient";
import { InvoiceButton } from "./InvoiceButton";

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
  const mapEmbedSrc =
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d860.7447724525811!2d-79.41244863168872!3d43.76037647252751!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x882b2dfb95c33ce1%3A0xf3a474361eec2a31!2z5LiJ56em6IKJ5aS56aaN!5e0!3m2!1szh-CN!2sca!4v1768280762067!5m2!1szh-CN!2sca";
  const mapNavigateUrl =
    "https://www.google.com/maps/dir/?api=1&destination=43.76037647252751,-79.41244863168872";

  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-10">
      {/* 支付成功页挂载时清空购物车（localStorage） */}
      <ClearCartOnMount />

      <div className="flex items-center justify-between mb-6">
        <div className="text-sm text-slate-500">{t.brand}</div>
        <a
          href={`/${alt}/thank-you/${order}`}
          className="rounded-full border px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          {t.switchLabel}
        </a>
      </div>

      <div className="rounded-3xl bg-slate-50 p-6 sm:p-10 shadow-sm">
        <h1 className="text-2xl sm:text-3xl font-semibold text-center mb-3">
          {t.title}
        </h1>
        <p className="text-center text-slate-600 mb-8">{t.intro}</p>

        {/* ✅ 新增：订单小结（从后端拉菜品/金额清单） */}
        {order ? (
          <>
            <OrderSummaryClient orderStableId={order} locale={locale} />
            <InvoiceButton orderStableId={order} locale={locale} />
          </>
        ) : null}

        <div className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-3 text-center">
            {t.mapTitle}
          </h2>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <iframe
              title={t.mapTitle}
              src={mapEmbedSrc}
              width="600"
              height="450"
              className="h-80 w-full sm:h-96"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <div className="mt-4 flex justify-center">
            <a
              href={mapNavigateUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-xl border border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-900 hover:text-white"
            >
              {t.mapCta}
            </a>
          </div>
        </div>

        <div className="mt-8 space-y-3 text-center">
          <p className="text-sm text-slate-600">{t.contact}</p>
          <a
            href={`/${locale}`}
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            {t.backCta}
          </a>
        </div>
      </div>
    </main>
  );
}
