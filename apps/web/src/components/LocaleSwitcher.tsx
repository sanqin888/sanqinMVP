//Users/apple/sanqinMVP/apps/web/src/components/LocaleSwitcher.tsx

"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { addLocaleToPath, removeLeadingLocale } from "@/lib/i18n/path";

export default function LocaleSwitcher({ locale }: { locale: "zh" | "en" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const other = locale === "zh" ? "en" : "zh";

  function switchLocale() {
    const clean = removeLeadingLocale(pathname || "/");
    const nextPath = addLocaleToPath(other, clean);
    const q = searchParams.toString();
    // 记一个 Cookie（辅助 RootLayout 设置 <html lang>）
    try {
      document.cookie = `locale=${other}; path=/; max-age=${60 * 60 * 24 * 365}`;
      localStorage.setItem("preferred-locale", other);
    } catch {}
    router.push(q ? `${nextPath}?${q}` : nextPath);
  }

  return (
    <button
      onClick={switchLocale}
      className="rounded-xl border px-3 py-1 text-sm hover:bg-gray-50"
      aria-label="Switch language"
    >
      {locale === "zh" ? "English" : "中文"}
    </button>
  );
}
