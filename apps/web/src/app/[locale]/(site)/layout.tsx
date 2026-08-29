// apps/web/src/app/[locale]/(site)/layout.tsx

import Link from "next/link";
import AnalyticsConsentControls from "@/components/AnalyticsConsentControls";
import CustomerSiteHeader, { CustomerSiteShellBoundary } from "@/components/site/CustomerSiteHeader";
import CustomerLocalePreferenceSync from "@/components/site/CustomerLocalePreferenceSync";

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

  const customerFooter = (
    <footer className="mx-auto mt-8 w-full max-w-[1600px] border-t border-[#87362E]/10 px-4 py-8 text-sm text-stone-500 sm:px-6 lg:px-8">
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
            {isZh
              ? `© ${year} 三秦。保留所有权利。`
              : `© ${year} San Qin. All rights reserved.`}
          </div>
        </div>
      </div>
    </footer>
  );

  return (
    <CustomerSiteShellBoundary
      customerHeader={<CustomerSiteHeader locale={safeLocale} />}
      customerFooter={customerFooter}
      localePreferenceSync={<CustomerLocalePreferenceSync locale={safeLocale} />}
    >
      {children}
    </CustomerSiteShellBoundary>
  );
}
