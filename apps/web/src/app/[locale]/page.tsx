//Users/apple/sanqinMVP/apps/web/src/app/[locale]/page.tsx

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams, useParams } from "next/navigation";
import {
  HOSTED_CHECKOUT_CURRENCY,
  LANGUAGE_NAMES,
  LOCALES,
  type Locale,
  UI_STRINGS,
  addLocaleToPath,
  buildLocalizedMenu,
} from "@/lib/order/shared";
import { usePersistentCart } from "@/lib/cart";

// 从 /api/auth/session 拿到的大致结构
type SessionLike = {
  user?: {
    name?: string | null;
    email?: string | null;
  } | null;
  userId?: string;
};

export default function LocalOrderPage() {
  const pathname = usePathname() || "/";
  const params = useParams<{ locale?: string }>();
  const locale = (params?.locale === "zh" ? "zh" : "en") as Locale;

  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams?.toString();

  const [isMemberLoggedIn, setIsMemberLoggedIn] = useState(false);
  const [memberName, setMemberName] = useState<string | null>(null);

  // 检查当前是否已登录会员（使用 next-auth 的 /api/auth/session）
  useEffect(() => {
    let cancelled = false;

    async function fetchSession() {
      try {
        const res = await fetch("/api/auth/session");
        if (!res.ok) {
          if (!cancelled) {
            setIsMemberLoggedIn(false);
            setMemberName(null);
          }
          return;
        }

        const data = (await res.json()) as SessionLike | null;
        if (cancelled) return;

        if (data?.userId) {
          setIsMemberLoggedIn(true);
          setMemberName(data.user?.name ?? null);
        } else {
          setIsMemberLoggedIn(false);
          setMemberName(null);
        }
      } catch {
        if (!cancelled) {
          setIsMemberLoggedIn(false);
          setMemberName(null);
        }
      }
    }

    void fetchSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const strings = UI_STRINGS[locale];
  const menu = useMemo(() => buildLocalizedMenu(locale), [locale]);
  const { addItem, totalQuantity } = usePersistentCart();

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale === "zh" ? "zh-Hans-CA" : "en-CA", {
        style: "currency",
        currency: HOSTED_CHECKOUT_CURRENCY,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [locale],
  );

  const checkoutHref = q ? `/${locale}/checkout?${q}` : `/${locale}/checkout`;

  // 会员按钮跳转和文案
  const membershipHref = isMemberLoggedIn
    ? `/${locale}/membership`
    : `/${locale}/membership/login`;

  const membershipLabel = (() => {
    if (locale === "zh") {
      if (isMemberLoggedIn) {
        return memberName ? `会员中心（${memberName}）` : "会员中心";
      }
      return "会员登录 / 注册";
    } else {
      if (isMemberLoggedIn) {
        return memberName ? `Member center (${memberName})` : "Member center";
      }
      return "Member login / sign up";
    }
  })();

  return (
    <div className="space-y-12 pb-28">
      <section className="rounded-3xl bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          {strings.tagline}
        </p>
        <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                {strings.heroTitle}
              </h1>
              <p className="mt-3 max-w-2xl text-base text-slate-600">
                {strings.heroDescription}
              </p>
            </div>
            <ol className="flex flex-wrap gap-2 text-xs text-slate-500">
              {strings.orderSteps.map((step) => (
                <li
                  key={step.id}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600"
                >
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-900 text-[0.65rem] font-semibold text-white">
                    {step.id}
                  </span>
                  {step.label}
                </li>
              ))}
            </ol>
          </div>

          <div className="flex flex-col items-start gap-4 lg:items-end">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium">{strings.languageSwitch}</span>
              <div className="inline-flex gap-1 rounded-full bg-slate-200 p-1">
                {LOCALES.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => {
                      try {
                        document.cookie = `locale=${code}; path=/; max-age=${
                          60 * 60 * 24 * 365
                        }`;
                        localStorage.setItem("preferred-locale", code);
                      } catch {
                        // ignore
                      }
                      const nextPath = addLocaleToPath(code, pathname || "/");
                      router.push(q ? `${nextPath}?${q}` : nextPath);
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      locale === code
                        ? "bg-white text-slate-900 shadow"
                        : "text-slate-600 hover:bg-white/70"
                    }`}
                    aria-pressed={locale === code}
                  >
                    {LANGUAGE_NAMES[code]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={membershipHref}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              >
                {membershipLabel}
              </Link>
              <Link
                href={checkoutHref}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              >
                {strings.cartTitle}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-10">
        {menu.map((category) => (
          <div key={category.id} className="space-y-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">
                  {category.name}
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-600">
                  {category.description}
                </p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {category.items.map((item) => (
                <article
                  key={item.id}
                  className="group flex h-full flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">
                          {item.name}
                        </h3>
                        <p className="mt-1 text-sm text-slate-600">
                          {item.description}
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-900/90 px-3 py-1 text-sm font-semibold text-white">
                        {currencyFormatter.format(item.price)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {item.tags?.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-600"
                        >
                          #{tag}
                        </span>
                      ))}
                      {item.calories ? (
                        <span className="rounded-full bg-amber-50 px-2 py-1 font-medium text-amber-600">
                          {item.calories} kcal
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-5 flex items-center justify-between gap-4">
                    <p className="text-xs text-slate-500">
                      {strings.limitedDaily}
                    </p>
                    <button
                      type="button"
                      onClick={() => addItem(item.id)}
                      className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                    >
                      {strings.addToCart}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
      </section>

      <Link
        href={checkoutHref}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-xl transition hover:bg-slate-700"
        aria-label={`${strings.floatingCartLabel} (${totalQuantity})`}
      >
        <span>{strings.floatingCartLabel}</span>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-sm font-semibold text-slate-900">
          {totalQuantity}
        </span>
      </Link>
    </div>
  );
}
