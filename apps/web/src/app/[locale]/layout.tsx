// apps/web/src/app/[locale]/layout.tsx

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LOCALES, isLocale } from "@/lib/i18n/locales";
import { localeAlternates } from "@/lib/i18n/path";

export const dynamicParams = false;

export async function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
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
      default: locale === "zh" ? "三秦肉夹馍" : "SanQ Roujiamo",
      template: locale === "zh" ? "三秦肉夹馍 • %s" : "SanQ Roujiamo • %s",
    },
    alternates,
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return <>{children}</>;
}
