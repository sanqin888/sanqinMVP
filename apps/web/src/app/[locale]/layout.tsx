//Users/apple/sanqinMVP/apps/web/src/app/[locale]/layout.tsx

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LOCALES, isLocale } from "@/lib/i18n/locales";
import { localeAlternates } from "@/lib/i18n/path";
import Link from "next/link";
import LocaleSwitcher from "@/components/LocaleSwitcher";

export const dynamicParams = false;

export async function generateStaticParams() {
  return LOCALES.map((l) => ({ locale: l }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const { alternates } = localeAlternates(locale);
  return {
    title: locale === "zh" ? "三秦 • 首页" : "San Qin • Home",
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

  return (
    <div className="min-h-screen">
      <header className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between border-b">
        <Link href={`/${locale}`} className="font-semibold">
          {locale === "zh" ? "三秦" : "San Qin"}
        </Link>
        <LocaleSwitcher locale={locale as "zh" | "en"} />
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      <footer className="mx-auto max-w-5xl px-4 py-8 text-sm text-gray-500">
        © {new Date().getFullYear()} San Qin
      </footer>
    </div>
  );
}
