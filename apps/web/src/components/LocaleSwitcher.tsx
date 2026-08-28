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
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#87362E]/20 bg-white text-xs font-extrabold text-[#87362E] transition hover:border-[#87362E]/40 hover:bg-[#fff3ea]"
      aria-label={locale === "zh" ? "切换到英文" : "Switch to Chinese"}
      title={locale === "zh" ? "英文" : "Chinese"}
    >
      {locale === "zh" ? "en" : "中"}
    </button>
  );
}
