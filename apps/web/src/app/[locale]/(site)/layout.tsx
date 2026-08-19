// apps/web/src/app/[locale]/(site)/layout.tsx

import Link from "next/link";
import Image from "next/image";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import AnalyticsConsentControls from "@/components/AnalyticsConsentControls";

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = locale === "zh" ? "zh" : "en";
  const isZh = safeLocale === "zh";
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between border-b px-4 py-4">
        <Link
          href={`/${safeLocale}`}
          className="font-semiboldflex flex items-center gap-2"
        >
          <div className="relative h-8 w-16 rounded-md bg-white">
            <Image
              src="/images/sanqinLOGO.png"
              alt="Logo"
              fill
              sizes="64px"
              className="object-contain"
            />
          </div>
          {isZh ? "三秦肉夹馍" : "SanQ Roujiamo"}
        </Link>
        <LocaleSwitcher locale={safeLocale} />
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>

      <footer className="mx-auto mt-8 max-w-5xl border-t px-4 py-6 text-sm text-gray-500">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <Link
              href={`/${safeLocale}/membership/rules`}
              className="hover:text-gray-800"
            >
              {isZh ? "会员规则" : "Membership rules"}
            </Link>
            <Link
              href={`/${safeLocale}/legal/privacy`}
              className="hover:text-gray-800"
            >
              {isZh ? "隐私政策" : "Privacy"}
            </Link>
            <Link
              href={`/${safeLocale}/legal/terms`}
              className="hover:text-gray-800"
            >
              {isZh ? "网站条款" : "Terms"}
            </Link>
            <Link
              href={`/${safeLocale}/legal/refund`}
              className="hover:text-gray-800"
            >
              {isZh ? "退款/取消" : "Refunds"}
            </Link>
            <Link
              href={`/${safeLocale}/legal/allergen`}
              className="hover:text-gray-800"
            >
              {isZh ? "过敏原说明" : "Allergen info"}
            </Link>
            <Link
              href={`/${safeLocale}/legal/contact`}
              className="hover:text-gray-800"
            >
              {isZh ? "联系我们" : "Contact us"}
            </Link>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <AnalyticsConsentControls locale={safeLocale} />
            <div className="text-xs text-gray-400">
              © {year} San Qin. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
