// apps/web/src/components/LocaleSwitcher.tsx

"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { addLocaleToPath, removeLeadingLocale } from "@/lib/i18n/path";

type LocaleSwitcherProps = {
  locale: "zh" | "en";
  variant?: "site" | "device";
};

export default function LocaleSwitcher({
  locale,
  variant = "site",
}: LocaleSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function switchLocale(nextLocale: "zh" | "en") {
    if (nextLocale === locale) return;

    const clean = removeLeadingLocale(pathname || "/");
    const nextPath = addLocaleToPath(nextLocale, clean);
    const q = searchParams.toString();

    try {
      document.cookie = `locale=${nextLocale}; path=/; max-age=${60 * 60 * 24 * 365}`;
      localStorage.setItem("preferred-locale", nextLocale);
    } catch {}

    router.push(q ? `${nextPath}?${q}` : nextPath);
  }

  if (variant === "device") {
    return (
      <div
        className="flex h-9 items-center rounded-full border border-slate-600 bg-slate-800 p-0.5 text-xs font-semibold text-slate-300"
        aria-label="POS language"
      >
        <button
          type="button"
          onClick={() => switchLocale("zh")}
          className={`h-8 rounded-full px-2.5 transition ${
            locale === "zh"
              ? "bg-slate-100 text-slate-900"
              : "hover:bg-slate-700 hover:text-white"
          }`}
          aria-pressed={locale === "zh"}
        >
          中文
        </button>
        <button
          type="button"
          onClick={() => switchLocale("en")}
          className={`h-8 rounded-full px-2.5 transition ${
            locale === "en"
              ? "bg-slate-100 text-slate-900"
              : "hover:bg-slate-700 hover:text-white"
          }`}
          aria-pressed={locale === "en"}
        >
          EN
        </button>
      </div>
    );
  }

  const other = locale === "zh" ? "en" : "zh";

  return (
    <button
      type="button"
      onClick={() => switchLocale(other)}
      className="rounded-xl border px-3 py-1 text-sm hover:bg-gray-50"
      aria-label="Switch language"
    >
      {locale === "zh" ? "English" : "中文"}
    </button>
  );
}
