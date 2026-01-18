// apps/web/src/app/[locale]/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { HOSTED_CHECKOUT_CURRENCY } from "@/lib/order/shared";
import type { Locale } from "@/lib/i18n/locales";
import { UI_STRINGS } from "@/lib/i18n/dictionaries";
import {
  buildLocalizedDailySpecials,
  buildLocalizedEntitlementItems,
  buildLocalizedMenuFromDb,
  type LocalizedDailySpecial,
  type LocalizedMenuItem,
  type PublicMenuCategory,
} from "@/lib/menu/menu-transformer";
import type {
  MenuEntitlementsResponse,
  PublicMenuResponse as PublicMenuApiResponse,
} from "@shared/menu";
import { usePersistentCart } from "@/lib/cart";
import { apiFetch } from "@/lib/api/client";
import { signOut, useSession } from "@/lib/auth-session";
import Image from "next/image";

export default function LocalOrderPage() {
  const params = useParams<{ locale?: string }>();
  const locale = (params?.locale === "zh" ? "zh" : "en") as Locale;

  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams?.toString();

  const { data: session } = useSession();
  const isMemberLoggedIn = Boolean(session?.user?.userStableId);
  const memberName = session?.user?.email ?? null;

  const strings = UI_STRINGS[locale];

  // —— 菜单：从后端 public API 读取 —— //
  const [menu, setMenu] = useState<PublicMenuCategory[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [dailySpecials, setDailySpecials] = useState<
    LocalizedDailySpecial[]
  >([]);
  const [cartNotice] = useState<string | null>(null);
  const [entitlements, setEntitlements] =
    useState<MenuEntitlementsResponse | null>(null);
  const [entitlementsError, setEntitlementsError] = useState<string | null>(
    null,
  );

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
        setDailySpecials(
          buildLocalizedDailySpecials(
            dbMenu.dailySpecials ?? [],
            localized,
            locale,
          ),
        );
      } catch (err) {
        console.error(err);
        if (cancelled) return;

        setMenu([]);
        setDailySpecials([]);
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

  useEffect(() => {
    let cancelled = false;

    async function loadEntitlements() {
      if (!isMemberLoggedIn) {
        setEntitlements(null);
        setEntitlementsError(null);
        return;
      }

      try {
        const data = await apiFetch<MenuEntitlementsResponse>(
          "/promotions/entitlements",
          {
            cache: "no-store",
          },
        );
        if (cancelled) return;
        setEntitlements(data);
        setEntitlementsError(null);
      } catch (err) {
        console.error(err);
        if (cancelled) return;
        setEntitlements(null);
        setEntitlementsError(
          locale === "zh"
            ? "专享套餐加载失败，请稍后重试。"
            : "Failed to load member exclusives. Please try again later.",
        );
      }
    }

    void loadEntitlements();

    return () => {
      cancelled = true;
    };
  }, [isMemberLoggedIn, locale]);

  const { addItem, totalQuantity, items: cartItems, removeItemsByStableId } =
    usePersistentCart();
  const [activeItem, setActiveItem] = useState<LocalizedMenuItem | null>(null);
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, string[]>
  >({});
  const [selectedChildOptions, setSelectedChildOptions] = useState<
    Record<string, string[]>
  >({});
  const entitlementItems = useMemo(
    () =>
      buildLocalizedEntitlementItems(
        entitlements?.unlockedItems ?? [],
        locale,
      ),
    [entitlements, locale],
  );

  const entitlementItemSet = useMemo(
    () => new Set(entitlements?.unlockedItemStableIds ?? []),
    [entitlements],
  );

  const mergedMenu = useMemo(() => {
    if (entitlementItems.length === 0) return menu;
    return [
      {
        stableId: "exclusive-combos",
        name: locale === "zh" ? "专享套餐" : "Exclusive combos",
        items: entitlementItems,
      },
      ...menu,
    ];
  }, [entitlementItems, locale, menu]);

  useEffect(() => {
    if (cartItems.length === 0) return;
    if (menuLoading || menu.length === 0 || menuError) return;
    if (isMemberLoggedIn && !entitlements && !entitlementsError) return;
    const allowedStableIds = new Set(
      menu.flatMap((category) =>
        category.items.map((item) => item.stableId),
      ),
    );
    entitlementItems.forEach((item) => allowedStableIds.add(item.stableId));

    const invalidItems = cartItems.filter(
      (item) => !allowedStableIds.has(item.productStableId),
    );
    if (invalidItems.length === 0) return;

    removeItemsByStableId(
      invalidItems.map((item) => item.productStableId),
    );
  }, [
    cartItems,
    entitlements,
    entitlementsError,
    entitlementItems,
    isMemberLoggedIn,
    menu,
    menuError,
    menuLoading,
    removeItemsByStableId,
  ]);

  const menuItemMap = useMemo(
    () =>
      new Map(
        mergedMenu.flatMap((category) =>
          category.items.map((item) => [item.stableId, item]),
        ),
      ),
    [mergedMenu],
  );

  const closeOptionsModal = () => {
    setActiveItem(null);
    setSelectedOptions({});
    setSelectedChildOptions({});
    setSelectedQuantity(1);
  };

  const handleOptionToggle = (
    groupStableId: string,
    optionStableId: string,
    minSelect: number,
    maxSelect: number | null,
  ) => {
    let removedParents: string[] = [];
    setSelectedOptions((prev) => {
      const current = new Set(prev[groupStableId] ?? []);

      if (maxSelect === 1) {
        if (current.has(optionStableId)) {
          if (minSelect > 0) {
            return prev;
          }
          removedParents = [optionStableId];
          const next = { ...prev };
          delete next[groupStableId];
          return next;
        }
        removedParents = Array.from(current);
        return { ...prev, [groupStableId]: [optionStableId] };
      }

      if (current.has(optionStableId)) {
        current.delete(optionStableId);
        removedParents = [optionStableId];
      } else {
        if (typeof maxSelect === "number" && current.size >= maxSelect) {
          return prev;
        }
        current.add(optionStableId);
      }

      if (current.size === 0) {
        const next = { ...prev };
        delete next[groupStableId];
        return next;
      }

      return { ...prev, [groupStableId]: Array.from(current) };
    });

    if (removedParents.length > 0) {
      setSelectedChildOptions((prev) => {
        const next = { ...prev };
        removedParents.forEach((parentId) => {
          delete next[parentId];
        });
        return next;
      });
    }
  };

  const handleChildOptionToggle = (
    parentOptionStableId: string,
    childOptionStableId: string,
  ) => {
    setSelectedChildOptions((prev) => {
      const current = new Set(prev[parentOptionStableId] ?? []);
      if (current.has(childOptionStableId)) {
        current.delete(childOptionStableId);
      } else {
        current.add(childOptionStableId);
      }
      if (current.size === 0) {
        const next = { ...prev };
        delete next[parentOptionStableId];
        return next;
      }
      return { ...prev, [parentOptionStableId]: Array.from(current) };
    });
  };

  useEffect(() => {
    if (!activeItem) return;
    const selectedParentIds = new Set(
      Object.values(selectedOptions).flat(),
    );
    const allowedChildrenByParent = new Map<string, Set<string>>();
    activeItem.optionGroups?.forEach((group) => {
      group.options.forEach((option) => {
        allowedChildrenByParent.set(
          option.optionStableId,
          new Set(option.childOptionStableIds ?? []),
        );
      });
    });

    setSelectedChildOptions((prev) => {
      let changed = false;
      const next: Record<string, string[]> = {};
      Object.entries(prev).forEach(([parentId, childIds]) => {
        if (!selectedParentIds.has(parentId)) {
          changed = true;
          return;
        }
        const allowed = allowedChildrenByParent.get(parentId);
        if (!allowed) {
          changed = true;
          return;
        }
        const filtered = childIds.filter((id) => allowed.has(id));
        if (filtered.length === 0) {
          if (childIds.length > 0) changed = true;
          return;
        }
        if (
          filtered.length !== childIds.length ||
          filtered.some((id, index) => id !== childIds[index])
        ) {
          changed = true;
        }
        next[parentId] = filtered;
      });
      return changed ? next : prev;
    });
  }, [activeItem, selectedOptions]);

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
    const allSelectedOptionIds = new Set<string>(
      Object.values({ ...selectedOptions, ...selectedChildOptions }).flat(),
    );
    optionGroups.forEach((group) => {
      const groupName =
        locale === "zh" && group.template.nameZh
          ? group.template.nameZh
          : group.template.nameEn;
      group.options.forEach((option) => {
        if (!allSelectedOptionIds.has(option.optionStableId)) return;
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
  }, [activeItem, locale, selectedChildOptions, selectedOptions]);

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
  const orderHref = q ? `/${locale}?${q}` : `/${locale}`;

  // 会员按钮跳转和文案
  const membershipHref = isMemberLoggedIn
    ? `/${locale}/membership`
    : `/${locale}/membership/login?redirect=${encodeURIComponent(orderHref)}`;

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

  const logoutLabel = locale === "zh" ? "退出登录" : "Log out";

  const handleLogout = () => {
    void signOut().then(() => router.push(`/${locale}`));
  };

  const isTempUnavailable = (tempUnavailableUntil?: string | null) => {
    if (!tempUnavailableUntil) return false;
    const parsed = Date.parse(tempUnavailableUntil);
    if (!Number.isFinite(parsed)) return false;
    return parsed > Date.now();
  };

  return (
    <div className="space-y-12 pb-28">
      {/* ===== Hero 区 ===== */}
      <section className="rounded-3xl bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          {strings.tagline}
        </p>
        <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4 relative z-10">
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

          <div className="flex flex-col items-start gap-4 lg:items-end relative">
           {/* 新增：插画容器 */}
<div className="hidden lg:block pointer-events-none absolute -top-60 right-4 z-0 opacity-90 lg:-top-32 lg:right-8">
               {/* 说明：
                  - -top-24 / -top-32: 向上移动，位于按钮上方的空白处
                  - width={130}: 图片缩小
                  - z-0: 层级最低，被按钮遮盖
            */}
          <Image 
       src="/images/chef.png"
       alt="Illustration"
       width={170} 
       height={200}
       className="object-contain scale-x-[-1]"
     />
  </div>
            <div className="flex flex-wrap gap-2 z-10 relative">
              <Link
                href={membershipHref}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              >
                {membershipLabel}
              </Link>
              {isMemberLoggedIn ? (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  {logoutLabel}
                </button>
              ) : null}
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
            {entitlementsError ? (
              <p className="text-xs text-amber-600">{entitlementsError}</p>
            ) : null}
            {cartNotice ? (
              <p className="text-xs text-amber-600">{cartNotice}</p>
            ) : null}

            {mergedMenu.length === 0 ? (
              <p className="text-sm text-slate-500">
                {locale === "zh"
                  ? "当前暂无可售菜品。"
                  : "No items available at the moment."}
              </p>
            ) : (
              <>
                {dailySpecials.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                      <div>
                        <h2 className="text-2xl font-semibold text-slate-900">
                          {locale === "zh" ? "今日特价" : "Today specials"}
                        </h2>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      {dailySpecials.map((special) => {
                        const item = menuItemMap.get(special.itemStableId);
                        if (!item) return null;
                        return (
                          <article
                            key={special.stableId}
                            className={`group flex h-full flex-col justify-between rounded-3xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm transition ${
                              isTempUnavailable(item.tempUnavailableUntil)
                                ? "cursor-not-allowed opacity-70"
                                : "cursor-pointer hover:-translate-y-0.5 hover:shadow-md"
                            }`}
                            onClick={() => {
                              if (isTempUnavailable(item.tempUnavailableUntil)) return;
                              setActiveItem(item);
                              setSelectedQuantity(1);
                              setSelectedOptions({});
                              setSelectedChildOptions({});
                            }}
                          >
                            <div className="space-y-2">
                              <div className="flex items-center gap-3">
                                {item.imageUrl ? (
                                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-amber-100">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={item.imageUrl}
                                      alt={item.name}
                                      className="h-full w-full object-cover"
                                    />
                                  </div>
                                ) : null}
                                <span className="rounded-full bg-amber-500/90 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                                  {locale === "zh" ? "特价" : "Special"}
                                </span>
                                <h3 className="text-lg font-semibold text-slate-900">
                                  {special.name}
                                </h3>
                              </div>
                              {item.ingredients ? (
                                <p className="text-xs text-slate-500">
                                  {item.ingredients}
                                </p>
                              ) : null}
                            </div>
                            <div className="mt-4 flex items-center justify-between">
                              <div className="flex items-baseline gap-2">
                                <span className="text-lg font-semibold text-slate-900">
                                  {currencyFormatter.format(
                                    special.effectivePriceCents / 100,
                                  )}
                                </span>
                                <span className="text-xs text-slate-400 line-through">
                                  {currencyFormatter.format(
                                    special.basePriceCents / 100,
                                  )}
                                </span>
                              </div>
                              {isTempUnavailable(item.tempUnavailableUntil) ? (
                                <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                                  {locale === "zh" ? "当日售罄" : "Sold out today"}
                                </span>
                              ) : null}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {mergedMenu.map((category) => (
                  <div key={category.stableId} className="space-y-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                      <div>
                        <h2 className="text-2xl font-semibold text-slate-900">
                          {category.name}
                        </h2>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      {category.items.map((item) => {
                        const isDailySpecial = Boolean(item.activeSpecial);
                        const isEntitlement = entitlementItemSet.has(
                          item.stableId,
                        );
                        return (
                          <article
                            key={item.stableId}
                            className={`group flex h-full flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition ${
                              isTempUnavailable(item.tempUnavailableUntil)
                                ? "cursor-not-allowed opacity-70"
                                : "cursor-pointer hover:-translate-y-0.5 hover:shadow-md"
                            }`}
                            onClick={() => {
                              if (isTempUnavailable(item.tempUnavailableUntil))
                                return;
                              setActiveItem(item);
                              setSelectedQuantity(1);
                              setSelectedOptions({});
                              setSelectedChildOptions({});
                            }}
                          >
                            {/* 菜品图片（可选） */}
                            {item.imageUrl ? (
                              <div className="mb-3 overflow-hidden rounded-2xl bg-slate-100">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  className="h-64 w-full object-cover transition duration-300 group-hover:scale-105"
                                />
                              </div>
                            ) : null}

                            <div className="space-y-3">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <div className="flex items-center gap-2">
                                    {isDailySpecial ? (
                                      <span className="rounded-full bg-amber-500/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                                        {locale === "zh" ? "特价" : "Special"}
                                      </span>
                                    ) : null}
                                    {isEntitlement ? (
                                      <span className="rounded-full bg-emerald-500/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                                        {locale === "zh"
                                          ? "需持券"
                                          : "Coupon required"}
                                      </span>
                                    ) : null}
                                    <h3 className="text-lg font-semibold text-slate-900">
                                      {item.name}
                                    </h3>
                                  </div>

                                  {/* 配料说明：菜名下面小字显示 */}
                                  {item.ingredients ? (
                                    <p className="mt-1 text-xs text-slate-500">
                                      {item.ingredients}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                  <span className="rounded-full bg-slate-900/90 px-3 py-1 text-sm font-semibold text-white">
                                    {currencyFormatter.format(item.price)}
                                  </span>
                                  {isDailySpecial &&
                                  item.basePriceCents >
                                    item.effectivePriceCents ? (
                                    <span className="text-xs text-slate-400 line-through">
                                      {currencyFormatter.format(
                                        item.basePriceCents / 100,
                                      )}
                                    </span>
                                  ) : null}
                                  {isTempUnavailable(
                                    item.tempUnavailableUntil,
                                  ) ? (
                                    <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                                      {locale === "zh"
                                        ? "当日售罄"
                                        : "Sold out today"}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            <div className="mt-5 flex items-center justify-end">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (
                                    isTempUnavailable(item.tempUnavailableUntil)
                                  )
                                    return;
                                  setActiveItem(item);
                                  setSelectedQuantity(1);
                                  setSelectedOptions({});
                                  setSelectedChildOptions({});
                                }}
                                disabled={isTempUnavailable(
                                  item.tempUnavailableUntil,
                                )}
                                className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                                  isTempUnavailable(item.tempUnavailableUntil)
                                    ? "cursor-not-allowed bg-slate-200 text-slate-400"
                                    : "bg-slate-900 text-white hover:bg-slate-700"
                                }`}
                              >
                                {isTempUnavailable(item.tempUnavailableUntil)
                                  ? locale === "zh"
                                    ? "当日售罄"
                                    : "Sold out today"
                                  : strings.chooseOptions}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </section>

      {/* ===== 菜品选项弹窗 ===== */}
      {activeItem ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 md:items-center">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
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

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
              {activeItem.imageUrl ? (
                <div className="overflow-hidden rounded-2xl bg-slate-100">
                  <div className="aspect-[5/3] w-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={activeItem.imageUrl}
                      alt={activeItem.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>
              ) : null}
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
                  const childOptionIds = new Set(
                    group.options.flatMap(
                      (option) => option.childOptionStableIds ?? [],
                    ),
                  );
                  const parentOptions = group.options.filter(
                    (option) => !childOptionIds.has(option.optionStableId),
                  );
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
                        {parentOptions.map((option) => {
                          const selected =
                            selectedOptions[group.templateGroupStableId]?.includes(
                              option.optionStableId,
                            ) ?? false;
                          const optionTempUnavailable = isTempUnavailable(
                            option.tempUnavailableUntil,
                          );
                          const optionLabel =
                            locale === "zh" && option.nameZh
                              ? option.nameZh
                              : option.nameEn;
                          const childOptions = (option.childOptionStableIds ?? [])
                            .map((childId) =>
                              group.options.find(
                                (child) => child.optionStableId === childId,
                              ),
                            )
                            .filter(
                              (childOption): childOption is NonNullable<typeof childOption> =>
                                Boolean(childOption),
                            );
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
                            <div
                              key={option.optionStableId}
                              className="flex flex-col gap-2"
                            >
                              <button
                                type="button"
                                disabled={optionTempUnavailable}
                                onClick={() =>
                                  optionTempUnavailable
                                    ? undefined
                                    : handleOptionToggle(
                                        group.templateGroupStableId,
                                        option.optionStableId,
                                        group.minSelect,
                                        group.maxSelect,
                                      )
                                }
                                className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition ${
                                  optionTempUnavailable
                                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                                    : selected
                                      ? "border-slate-900 bg-slate-900 text-white"
                                      : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                                }`}
                              >
                                <span className="flex flex-col gap-1">
                                  <span className="font-medium">{optionLabel}</span>
                                  {optionTempUnavailable ? (
                                    <span className="text-xs font-semibold text-amber-600">
                                      {locale === "zh"
                                        ? "当日售罄"
                                        : "Sold out today"}
                                    </span>
                                  ) : null}
                                </span>
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
                              {selected && childOptions.length > 0 ? (
                                <div className="grid gap-2 pl-2 md:grid-cols-2">
                                  {childOptions.map((child) => {
                                    const childSelected =
                                      selectedChildOptions[
                                        option.optionStableId
                                      ]?.includes(child.optionStableId) ?? false;
                                    const childTempUnavailable = isTempUnavailable(
                                      child.tempUnavailableUntil,
                                    );
                                    const childLabel =
                                      locale === "zh" && child.nameZh
                                        ? child.nameZh
                                        : child.nameEn;
                                    const childPriceDelta =
                                      child.priceDeltaCents > 0
                                        ? `+${currencyFormatter.format(
                                            child.priceDeltaCents / 100,
                                          )}`
                                        : child.priceDeltaCents < 0
                                          ? `-${currencyFormatter.format(
                                              Math.abs(child.priceDeltaCents) / 100,
                                            )}`
                                          : "";

                                    return (
                                      <button
                                        key={child.optionStableId}
                                        type="button"
                                        disabled={childTempUnavailable}
                                        onClick={() =>
                                          childTempUnavailable
                                            ? undefined
                                            : handleChildOptionToggle(
                                                option.optionStableId,
                                                child.optionStableId,
                                              )
                                        }
                                        className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left text-xs transition ${
                                          childTempUnavailable
                                            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                                            : childSelected
                                              ? "border-slate-900 bg-slate-900 text-white"
                                              : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                                        }`}
                                      >
                                        <span className="flex flex-col gap-1">
                                          <span className="font-medium">
                                            {childLabel}
                                          </span>
                                          {childTempUnavailable ? (
                                            <span className="text-[10px] font-semibold text-amber-600">
                                              {locale === "zh"
                                                ? "当日售罄"
                                                : "Sold out today"}
                                            </span>
                                          ) : null}
                                        </span>
                                        {childPriceDelta ? (
                                          <span
                                            className={`text-[10px] font-semibold ${
                                              childSelected
                                                ? "text-white/80"
                                                : "text-slate-400"
                                            }`}
                                          >
                                            {childPriceDelta}
                                          </span>
                                        ) : null}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
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
                <div className="flex items-center gap-3">
                  <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-1 shadow-sm">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedQuantity((qty) => Math.max(1, qty - 1))
                      }
                      disabled={selectedQuantity <= 1}
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold transition ${
                        selectedQuantity <= 1
                          ? "cursor-not-allowed text-slate-300"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                      aria-label={
                        locale === "zh" ? "减少数量" : "Decrease quantity"
                      }
                    >
                      −
                    </button>
                    <span className="min-w-[2.5rem] text-center text-sm font-semibold text-slate-700">
                      {selectedQuantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedQuantity((qty) => qty + 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold text-slate-600 transition hover:bg-slate-100"
                      aria-label={
                        locale === "zh" ? "增加数量" : "Increase quantity"
                      }
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!activeItem || !canAddToCart) return;
                      addItem(
                        activeItem.stableId,
                        {
                          ...selectedOptions,
                          ...selectedChildOptions,
                        },
                        selectedQuantity,
                      );
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
