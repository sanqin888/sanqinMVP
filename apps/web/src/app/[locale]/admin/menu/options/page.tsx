//apps/web/src/app/[locale]/admin/menu/options/page.tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { Locale } from "@/lib/order/shared";
import { OptionTemplatesPanel } from "../OptionTemplatesPanel";

export default function AdminOptionLibraryPage() {
  const params = useParams<{ locale: Locale }>();
  const locale = (params?.locale === "zh" ? "zh" : "en") as Locale;
  const isZh = locale === "zh";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Admin
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">
            {isZh ? "选项库（全局）" : "Option Library (Global)"}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            {isZh
              ? "在这里维护可复用的选项组与选项（如：辣度、加料）。"
              : "Maintain reusable option groups/options here (e.g., spice level, add-ons)."}
          </p>
        </div>

        <Link
          href={`/${locale}/admin/menu`}
          className="text-sm font-medium text-emerald-700 hover:text-emerald-600"
        >
          {isZh ? "返回菜单维护" : "Back to menu"}
        </Link>
      </div>

      <OptionTemplatesPanel isZh={isZh} />
    </div>
  );
}
