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
    const destination = q ? `${nextPath}?${q}` : nextPath;

    document.cookie = `locale=${nextLocale}; path=/; max-age=${60 * 60 * 24 * 365}`;
    if (variant === "site") {
      document.cookie = `preferred_locale=${nextLocale}; path=/; max-age=${60 * 60 * 24 * 365}`;
    }
    router.push(destination);
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
      className="inline-flex h-10 items-center justify-center rounded-full border border-[#87362E]/20 bg-white px-3 text-xs font-semibold text-[#87362E] transition hover:border-[#87362E]/40 hover:bg-[#fff3ea] sm:text-sm"
      aria-label={locale === "zh" ? "切换语言" : "Switch language"}
    >
      <svg
        viewBox="0 0 24 24"
        className="mr-1.5 h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
      </svg>
      {locale === "zh" ? "语言" : "Language"}
    </button>
  );
}
