// apps/web/src/app/[locale]/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
  useParams,
} from "next/navigation";
import {
  HOSTED_CHECKOUT_CURRENCY,
  LANGUAGE_NAMES,
  LOCALES,
  type Locale,
  UI_STRINGS,
  addLocaleToPath,
  buildLocalizedMenuFromDb,
  type LocalizedMenuItem,
  type PublicMenuApiResponse,
  type PublicMenuCategory,
} from "@/lib/order/shared";
import { usePersistentCart } from "@/lib/cart";
import { apiFetch } from "@/lib/api-client";

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

  // —— 会员登录状态：使用 next-auth 的 /api/auth/session —— //
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

  // —— 菜单：从后端 public API 读取 —— //
  const [menu, setMenu] = useState<PublicMenuCategory[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMenu() {
      setMenuLoading(true);
      setMenuError(null);

      try {
        // ✅ public endpoint：/api/v1/menu/public
        const dbMenu = await apiFetch<PublicMenuApiResponse>("/menu/public", {
          cache: "no-store",
        });
        if (cancelled) return;

        const localized = buildLocalizedMenuFromDb(
          dbMenu.categories ?? [],
          locale,
        );
        setMenu(localized);
      } catch (err) {
        console.error(err);
        if (cancelled) return;

        setMenu([]);
        setMenuError(
          locale === "zh"
            ? "菜单从服务器加载失败，请稍后重试或联系门店。"
            : "Failed to load menu from server. Please try again later or contact the store.",
        );
      } finally {
        if (!cancelled) {
          setMenuLoading(false);
        }
      }
    }

    void loadMenu();

    return () => {
      cancelled = true;
    };
  }, [locale]);

  const { addItem, totalQuantity } = usePersistentCart();
  const [activeItem, setActiveItem] = useState<LocalizedMenuItem | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, string[]>
  >({});

  const closeOptionsModal = () => {
    setActiveItem(null);
    setSelectedOptions({});
  };

  const handleOptionToggle = (
    groupStableId: string,
    optionStableId: string,
    minSelect: number,
    maxSelect: number | null,
  ) => {
    setSelectedOptions((prev) => {
      const current = new Set(prev[groupStableId] ?? []);

      if (maxSelect === 1) {
        if (current.has(optionStableId)) {
          if (minSelect > 0) {
            return prev;
          }
          const { [groupStableId]: _removed, ...rest } = prev;
          return rest;
        }
        return { ...prev, [groupStableId]: [optionStableId] };
      }

      if (current.has(optionStableId)) {
        current.delete(optionStableId);
      } else {
        if (typeof maxSelect === "number" && current.size >= maxSelect) {
          return prev;
        }
        current.add(optionStableId);
      }

      if (current.size === 0) {
        const { [groupStableId]: _removed, ...rest } = prev;
        return rest;
      }

      return { ...prev, [groupStableId]: Array.from(current) };
    });
  };

  const requiredGroupsMissing = useMemo(() => {
    if (!activeItem) return [];
    return (activeItem.optionGroups ?? []).filter((group) => {
      const selectedCount = selectedOptions[group.templateGroupStableId]?.length;
      return group.minSelect > 0 && (selectedCount ?? 0) < group.minSelect;
    });
  }, [activeItem, selectedOptions]);

  const selectedOptionsDetails = useMemo(() => {
    if (!activeItem) return [];
    const details: Array<{
      groupName: string;
      optionName: string;
      priceDeltaCents: number;
    }> = [];
    const optionGroups = activeItem.optionGroups ?? [];
    optionGroups.forEach((group) => {
      const groupSelections =
        selectedOptions[group.templateGroupStableId] ?? [];
      if (groupSelections.length === 0) return;
      const groupName =
        locale === "zh" && group.template.nameZh
          ? group.template.nameZh
          : group.template.nameEn;
      group.options.forEach((option) => {
        if (!groupSelections.includes(option.optionStableId)) return;
        const optionName =
          locale === "zh" && option.nameZh ? option.nameZh : option.nameEn;
        details.push({
          groupName,
          optionName,
          priceDeltaCents: option.priceDeltaCents,
        });
      });
    });
    return details;
  }, [activeItem, locale, selectedOptions]);

  const optionsPriceCents = useMemo(
    () =>
      selectedOptionsDetails.reduce(
        (sum, option) => sum + option.priceDeltaCents,
        0,
      ),
    [selectedOptionsDetails],
  );

  const canAddToCart =
    activeItem && requiredGroupsMissing.length === 0 && menuLoading === false;

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
      {/* ===== Hero 区 ===== */}
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

      {/* ===== 菜单区 ===== */}
      <section className="space-y-10">
        {menuLoading ? (
          <p className="text-sm text-slate-500">
            {locale === "zh" ? "菜单加载中…" : "Loading menu…"}
          </p>
        ) : (
          <>
            {menuError ? (
              <p className="text-xs text-amber-600">{menuError}</p>
            ) : null}

            {menu.length === 0 ? (
              <p className="text-sm text-slate-500">
                {locale === "zh"
                  ? "当前暂无可售菜品。"
                  : "No items available at the moment."}
              </p>
            ) : (
              menu.map((category) => (
                <div key={category.stableId} className="space-y-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                    <div>
                      <h2 className="text-2xl font-semibold text-slate-900">
                        {category.name}
                      </h2>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {category.items.map((item) => (
                      <article
                        key={item.stableId}
                        className="group flex h-full cursor-pointer flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                        onClick={() => {
                          setActiveItem(item);
                          setSelectedOptions({});
                        }}
                      >
                        {/* 菜品图片（可选） */}
                        {item.imageUrl ? (
                          <div className="mb-3 overflow-hidden rounded-2xl bg-slate-100">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="h-40 w-full object-cover transition duration-300 group-hover:scale-105"
                            />
                          </div>
                        ) : null}

                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <h3 className="text-lg font-semibold text-slate-900">
                                {item.name}
                              </h3>

                              {/* 配料说明：菜名下面小字显示 */}
                              {item.ingredients ? (
                                <p className="mt-1 text-xs text-slate-500">
                                  {item.ingredients}
                                </p>
                              ) : null}
                            </div>
                            <span className="rounded-full bg-slate-900/90 px-3 py-1 text-sm font-semibold text-white">
                              {currencyFormatter.format(item.price)}
                            </span>
                          </div>
                        </div>

                        <div className="mt-5 flex items-center justify-end">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setActiveItem(item);
                              setSelectedOptions({});
                            }}
                            className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                          >
                            {strings.chooseOptions}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </section>

      {/* ===== 菜品选项弹窗 ===== */}
      {activeItem ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 md:items-center">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  {locale === "zh" ? "菜品选项" : "Dish options"}
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-900">
                  {activeItem.name}
                </h3>
                {activeItem.ingredients ? (
                  <p className="mt-2 text-sm text-slate-500">
                    {activeItem.ingredients}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={closeOptionsModal}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 transition hover:border-slate-300 hover:bg-slate-50"
              >
                {locale === "zh" ? "关闭" : "Close"}
              </button>
            </div>

            <div className="max-h-[60vh] space-y-6 overflow-y-auto px-6 py-5">
              {(activeItem.optionGroups ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">
                  {locale === "zh"
                    ? "该菜品暂无可选项。"
                    : "No options available for this dish."}
                </p>
              ) : (
                (activeItem.optionGroups ?? []).map((group) => {
                  const selectedCount =
                    selectedOptions[group.templateGroupStableId]?.length ?? 0;
                  const requirementLabel = (() => {
                    if (group.minSelect > 0 && group.maxSelect === 1) {
                      return locale === "zh" ? "必选 1 项" : "Required: 1";
                    }
                    if (group.minSelect > 0 && group.maxSelect) {
                      return locale === "zh"
                        ? `必选 ${group.minSelect}-${group.maxSelect} 项`
                        : `Required: ${group.minSelect}-${group.maxSelect}`;
                    }
                    if (group.minSelect > 0) {
                      return locale === "zh"
                        ? `至少选择 ${group.minSelect} 项`
                        : `Pick at least ${group.minSelect}`;
                    }
                    if (group.maxSelect) {
                      return locale === "zh"
                        ? `最多选择 ${group.maxSelect} 项`
                        : `Up to ${group.maxSelect}`;
                    }
                    return locale === "zh" ? "可选" : "Optional";
                  })();

                  return (
                    <div key={group.templateGroupStableId} className="space-y-3">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h4 className="text-base font-semibold text-slate-900">
                            {locale === "zh" && group.template.nameZh
                              ? group.template.nameZh
                              : group.template.nameEn}
                          </h4>
                          <p className="text-xs text-slate-500">
                            {requirementLabel}
                          </p>
                        </div>
                        <span
                          className={`text-xs font-semibold ${
                            group.minSelect > 0 && selectedCount < group.minSelect
                              ? "text-rose-500"
                              : "text-slate-400"
                          }`}
                        >
                          {locale === "zh"
                            ? `已选 ${selectedCount}`
                            : `${selectedCount} selected`}
                        </span>
                      </div>

                      <div className="grid gap-2 md:grid-cols-2">
                        {group.options.map((option) => {
                          const selected =
                            selectedOptions[group.templateGroupStableId]?.includes(
                              option.optionStableId,
                            ) ?? false;
                          const optionLabel =
                            locale === "zh" && option.nameZh
                              ? option.nameZh
                              : option.nameEn;
                          const priceDelta =
                            option.priceDeltaCents > 0
                              ? `+${currencyFormatter.format(
                                  option.priceDeltaCents / 100,
                                )}`
                              : option.priceDeltaCents < 0
                                ? `-${currencyFormatter.format(
                                    Math.abs(option.priceDeltaCents) / 100,
                                  )}`
                                : "";

                          return (
                            <button
                              key={option.optionStableId}
                              type="button"
                              onClick={() =>
                                handleOptionToggle(
                                  group.templateGroupStableId,
                                  option.optionStableId,
                                  group.minSelect,
                                  group.maxSelect,
                                )
                              }
                              className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition ${
                                selected
                                  ? "border-slate-900 bg-slate-900 text-white"
                                  : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                              }`}
                            >
                              <span className="font-medium">{optionLabel}</span>
                              {priceDelta ? (
                                <span
                                  className={`text-xs font-semibold ${
                                    selected ? "text-white/80" : "text-slate-400"
                                  }`}
                                >
                                  {priceDelta}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="space-y-4 border-t border-slate-100 px-6 py-5">
              {requiredGroupsMissing.length > 0 ? (
                <p className="text-xs text-rose-500">
                  {locale === "zh"
                    ? "请完成所有必选项后再加入购物车。"
                    : "Please complete all required selections before adding to cart."}
                </p>
              ) : null}

              {selectedOptionsDetails.length > 0 ? (
                <div className="space-y-2 rounded-2xl bg-slate-50 p-4 text-xs text-slate-500">
                  {selectedOptionsDetails.map((option) => (
                    <div
                      key={`${option.groupName}-${option.optionName}`}
                      className="flex items-center justify-between"
                    >
                      <span>
                        {option.groupName} · {option.optionName}
                      </span>
                      {option.priceDeltaCents !== 0 ? (
                        <span>
                          {option.priceDeltaCents > 0 ? "+" : "-"}
                          {currencyFormatter.format(
                            Math.abs(option.priceDeltaCents) / 100,
                          )}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-600">
                  {locale === "zh" ? "当前价格" : "Current price"}:{" "}
                  <span className="font-semibold text-slate-900">
                    {currencyFormatter.format(
                      (activeItem.price * 100 + optionsPriceCents) / 100,
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!activeItem || !canAddToCart) return;
                    addItem(activeItem.stableId, selectedOptions);
                    closeOptionsModal();
                  }}
                  disabled={!canAddToCart}
                  className={`inline-flex items-center justify-center rounded-full px-6 py-2 text-sm font-semibold transition ${
                    canAddToCart
                      ? "bg-slate-900 text-white hover:bg-slate-700"
                      : "cursor-not-allowed bg-slate-200 text-slate-400"
                  }`}
                >
                  {strings.addToCart}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* 浮动购物车入口 */}
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
