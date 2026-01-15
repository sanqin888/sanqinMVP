// apps/web/src/app/[locale]/layout.tsx

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LOCALES, isLocale } from "@/lib/i18n/locales";
import { localeAlternates } from "@/lib/i18n/path";
import Link from "next/link";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import Image from "next/image";

export const dynamicParams = false;

export async function generateStaticParams() {
  return LOCALES.map((l) => ({ locale: l }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};

  const { alternates } = localeAlternates(locale);

  return {
    title: {
      default: locale === "zh" ? "三秦肉夹馍" : "SanQin Traditional Burger",
      template: locale === "zh" ? "三秦 • %s" : "SanQin • %s",
    },
    alternates,
  };
}

export default async function I18nLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const isZh = locale === "zh";
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between border-b px-4 py-4">        <Link href={`/${locale}`} className="font-semiboldflex flex items-center gap-2">
        {/* 新增：Logo 图片 */}
        <div className="relative h-8 w-8 overflow-hidden rounded-full"> {/* 根据需要调整尺寸和样式 */}
        <Image 
          src="/images/sanqinLOGO.png" // 替换为您的 Logo 路径，例如放在 public/images/ 下
          alt="Logo"
          fill
          className="object-cover"
        />
        </div>
          {isZh ? "三秦" : "San Qin"}
        </Link>
        <LocaleSwitcher locale={locale as "zh" | "en"} />
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>

      <footer className="mx-auto mt-8 max-w-5xl border-t px-4 py-6 text-sm text-gray-500">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <Link href={`/${locale}/membership/rules`} className="hover:text-gray-800">
              {isZh ? "会员规则" : "Membership rules"}
            </Link>
            <Link href={`/${locale}/legal/privacy`} className="hover:text-gray-800">
              {isZh ? "隐私政策" : "Privacy"}
            </Link>
            <Link href={`/${locale}/legal/terms`} className="hover:text-gray-800">
              {isZh ? "网站条款" : "Terms"}
            </Link>
            <Link href={`/${locale}/legal/refund`} className="hover:text-gray-800">
              {isZh ? "退款/取消" : "Refunds"}
            </Link>
            <Link href={`/${locale}/legal/allergen`} className="hover:text-gray-800">
              {isZh ? "过敏原说明" : "Allergen info"}
            </Link>
          </div>
          <div className="text-xs text-gray-400">© {year} San Qin. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
