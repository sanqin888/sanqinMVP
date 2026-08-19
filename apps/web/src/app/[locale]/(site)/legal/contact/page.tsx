// apps/web/src/app/[locale]/legal/contact/page.tsx

import type { Metadata } from "next";
import type { Locale } from "@/lib/i18n/locales";
import { isLocale } from "@/lib/i18n/locales";
import { notFound } from "next/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const isZh = locale === "zh";

  return {
    title: isZh ? "三秦 · 联系我们" : "San Qin · Contact us",
  };
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const isZh = locale === "zh";

  const mapEmbedSrc =
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d860.7447724525811!2d-79.41244863168872!3d43.76037647252751!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x882b2dfb95c33ce1%3A0xf3a474361eec2a31!2z5LiJ56em6IKJ5aS56aaN!5e0!3m2!1szh-CN!2sca!4v1768280762067!5m2!1szh-CN!2sca";
  const mapNavigateUrl =
    "https://www.google.com/maps/dir/?api=1&destination=43.76037647252751,-79.41244863168872";

  return (
    <div className="space-y-6 text-sm text-slate-800">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">
          {isZh ? "联系我们" : "Contact us"}
        </h1>
        <p className="text-xs text-slate-500">
          {isZh
            ? "如有订单、会员或网站相关问题，欢迎通过以下方式联系我们。"
            : "For questions about orders, membership, or the website, reach out to us via the details below."}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "联系方式" : "Contact details"}
        </h2>
        <ul className="space-y-2">
          <li>
            <span className="font-semibold">{isZh ? "联系电话：" : "Phone: "}</span>
            +1(437) 808 - 6888
          </li>
          <li>
            <span className="font-semibold">
              {isZh ? "客服邮箱：" : "Support email: "}
            </span>
            <a className="text-slate-900 underline" href="mailto:support@sanq.ca">
              support@sanq.ca
            </a>
          </li>
          <li>
            <span className="font-semibold">{isZh ? "地址：" : "Address: "}</span>
            Unit 138, 4750 Yonge St, North York, On, M2N 5M6
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">
          {isZh ? "门店位置" : "Store location"}
        </h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <iframe
            title={isZh ? "门店位置" : "Store location"}
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
        <div className="flex justify-center">
          <a
            href={mapNavigateUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-xl border border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-900 hover:text-white"
          >
            {isZh ? "在 Google 地图中打开" : "Open in Google Maps"}
          </a>
        </div>
      </section>
    </div>
  );
}
