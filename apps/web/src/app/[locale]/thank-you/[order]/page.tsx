// apps/web/src/app/[locale]/thank-you/[order]/page.tsx
import Link from "next/link";
import type { Locale } from "@/lib/i18n/locales";              // 若没 @ 别名，用相对路径：../../../lib/i18n/locales
import { getDictionary } from "@/lib/i18n/dictionaries";       // 若没 @ 别名，用相对路径：../../../lib/i18n/dictionaries

type PageProps = {
  params: { locale?: string; order?: string };
};

const SUPPORTED: Locale[] = ["zh", "en"];

export default async function ThankYouPage({ params }: PageProps) {
  const locale = (SUPPORTED.includes(params?.locale as Locale)
    ? (params!.locale as Locale)
    : "en") as Locale;

  const dict = await getDictionary(locale);
  const t = dict.thankYou;                // 取“感谢页”命名空间
  const order = params?.order ?? "";
  const alt = locale === "zh" ? "en" : "zh";

  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-10">
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

        <div className="mx-auto max-w-md rounded-2xl border bg-white p-6 sm:p-8 text-center mb-8">
          <div className="text-sm text-slate-500 mb-2">{t.numberLabel}</div>
          <div className="text-2xl sm:text-3xl font-extrabold tracking-wider">
            {order}
          </div>
          <p className="mt-3 text-xs text-slate-500">{t.note}</p>
        </div>

        <div className="space-y-3 text-center">
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