// apps/web/src/app/[locale]/store/pos/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import type { Locale } from "@/lib/order/shared";
import {
  TAX_RATE,
  buildLocalizedMenu,
  MENU_ITEM_LOOKUP,
  type MenuItemDefinition,
} from "@/lib/order/shared";
import { apiFetch } from "@/lib/api-client";

type PosCartEntry = {
  itemId: string;
  quantity: number;
};

const POS_DISPLAY_STORAGE_KEY = "sanqin-pos-display-v1";

type PosDisplaySnapshot = {
  items: {
    id: string;
    nameZh: string;
    nameEn: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

type LocalizedMenuItem = ReturnType<
  typeof buildLocalizedMenu
>[number]["items"][number];

type StoreStatusRuleSource =
  | "REGULAR_HOURS"
  | "HOLIDAY"
  | "CLOSED_ALL_DAY"
  | "TEMPORARY_CLOSE";

type StoreStatus = {
  isOpen: boolean;
  isTemporarilyClosed: boolean;
  temporaryCloseReason: string | null;
  ruleSource: StoreStatusRuleSource;
  nextOpenAt?: string | null;
  today?: {
    date: string;
    isHoliday: boolean;
    holidayName: string | null;
  };
};

const STRINGS = {
  zh: {
    title: "门店点单 · POS",
    subtitle: "触摸屏点单界面 · 大按钮方便操作。",
    pickup: "到店自取",
    dineIn: "堂食",
    fulfillmentLabel: "取餐方式",
    categoriesAll: "全部",
    cartTitle: "本单菜品",
    emptyCart: "尚未选择菜品。",
    subtotal: "小计",
    tax: "税费 (HST)",
    total: "合计",
    clearCart: "清空",
    placeOrder: "下单",
    placing: "下单中…",
    qtyLabel: "份数",
    tapToAdd: "点击添加",
    successTitle: "下单成功",
    successBody: "单号与取餐码已显示在看板。",
    close: "关闭",
    errorGeneric: "下单失败，请稍后重试。",
    // 门店状态相关
    storeStatusOpen: "营业中",
    storeStatusClosed: "暂停接单",
    storeStatusHoliday: "节假日休息",
    storeStatusTemporaryClosed: "当前门店已暂停接单。",
    storeStatusClosedBySchedule: "当前不在营业时间内，暂时不支持新建订单。",
    storeStatusNextOpenPrefix: "下次营业时间：",
    storeStatusLoading: "正在获取门店状态…",
    storeStatusError: "门店状态获取失败，请以店内实际情况为准。",
  },
  en: {
    title: "Store POS",
    subtitle: "Touch-friendly POS screen with large buttons.",
    pickup: "Pickup",
    dineIn: "Dine-in",
    fulfillmentLabel: "Fulfillment",
    categoriesAll: "All",
    cartTitle: "Current order",
    emptyCart: "No items selected.",
    subtotal: "Subtotal",
    tax: "Tax (HST)",
    total: "Total",
    clearCart: "Clear",
    placeOrder: "Place order",
    placing: "Placing…",
    qtyLabel: "Qty",
    tapToAdd: "Tap to add",
    successTitle: "Order created",
    successBody: "Order number and pickup code are shown on the board.",
    close: "Close",
    errorGeneric: "Failed to place order. Please try again.",
    // 门店状态相关
    storeStatusOpen: "Open for orders",
    storeStatusClosed: "Paused",
    storeStatusHoliday: "Closed for holiday",
    storeStatusTemporaryClosed:
      "The store is temporarily not accepting new orders.",
    storeStatusClosedBySchedule:
      "The store is currently closed and cannot accept new orders.",
    storeStatusNextOpenPrefix: "Next opening time: ",
    storeStatusLoading: "Checking store status…",
    storeStatusError:
      "Unable to load store status. Please confirm with the store.",
  },
} as const;

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function StorePosPage() {
  const params = useParams<{ locale?: string }>();
  const locale = (params?.locale === "zh" ? "zh" : "en") as Locale;
  const isZh = locale === "zh";
  const router = useRouter();
  const t = STRINGS[locale];

  const menuCategories = useMemo(() => buildLocalizedMenu(locale), [locale]);

  const [activeCategoryId, setActiveCategoryId] = useState<string>("all");
  const [cart, setCart] = useState<PosCartEntry[]>([]);
  const [isPlacing, setIsPlacing] = useState(false);
  const [lastOrderInfo, setLastOrderInfo] = useState<{
    orderNumber: string;
    pickupCode?: string | null;
  } | null>(null);

  // 门店状态
  const [storeStatus, setStoreStatus] = useState<StoreStatus | null>(null);
  const [storeStatusLoading, setStoreStatusLoading] = useState(false);
  const [storeStatusError, setStoreStatusError] = useState<string | null>(null);

  // 加载门店营业状态（web / POS 共用）
  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        setStoreStatusLoading(true);
        setStoreStatusError(null);
        const data = await apiFetch<StoreStatus>("/public/store-status");
        if (cancelled) return;
        setStoreStatus(data);
      } catch (error) {
        console.error("Failed to load store status", error);
        if (cancelled) return;
        setStoreStatusError(
          isZh
            ? "门店状态加载失败，请以店内实际情况为准。"
            : "Failed to load store status. Please check the store status manually.",
        );
      } finally {
        if (!cancelled) {
          setStoreStatusLoading(false);
        }
      }
    }

    void loadStatus();

    // 简单轮询：每 60 秒刷新一次
    const intervalId = window.setInterval(loadStatus, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isZh]);

  const isStoreOpen = storeStatus?.isOpen ?? true;

  let storeStatusDetail: string | null = null;
  if (storeStatus && !isStoreOpen) {
    if (
      storeStatus.ruleSource === "TEMPORARY_CLOSE" &&
      storeStatus.isTemporarilyClosed
    ) {
      if (storeStatus.temporaryCloseReason?.trim()) {
        storeStatusDetail = isZh
          ? `当前门店暂停接单：${storeStatus.temporaryCloseReason}`
          : `The store is temporarily not accepting orders: ${storeStatus.temporaryCloseReason}`;
      } else {
        storeStatusDetail = isZh
          ? t.storeStatusTemporaryClosed
          : t.storeStatusTemporaryClosed;
      }
    } else if (storeStatus.ruleSource === "HOLIDAY") {
      const holidayName =
        storeStatus.today?.holidayName || (isZh ? "节假日" : "holiday");
      storeStatusDetail = isZh
        ? `${holidayName}休息，今日不接新订单。`
        : `Closed today for ${holidayName}.`;
    } else {
      storeStatusDetail = isZh
        ? t.storeStatusClosedBySchedule
        : t.storeStatusClosedBySchedule;
    }

    if (storeStatus.nextOpenAt) {
      const formatted = new Date(storeStatus.nextOpenAt).toLocaleString(
        isZh ? "zh-Hans-CA" : "en-CA",
        {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        },
      );
      storeStatusDetail +=
        (storeStatusDetail ? " " : "") +
        (isZh
          ? `${t.storeStatusNextOpenPrefix}${formatted}`
          : `${t.storeStatusNextOpenPrefix}${formatted}`);
    }
  }

  // 计算带详情的购物车
  const cartWithDetails = useMemo(() => {
    return cart
      .map((entry) => {
        const def = MENU_ITEM_LOOKUP.get(entry.itemId) as
          | MenuItemDefinition
          | undefined;
        if (!def) return null;
        const localized = menuItemFromDef(def, locale);
        const unitPriceCents = Math.round(def.price * 100);
        return {
          ...entry,
          def,
          localized,
          unitPriceCents,
          lineTotalCents: unitPriceCents * entry.quantity,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
  }, [cart, locale]);

  const subtotalCents = useMemo(
    () => cartWithDetails.reduce((sum, item) => sum + item.lineTotalCents, 0),
    [cartWithDetails],
  );
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  const totalCents = subtotalCents + taxCents;

  const hasItems = cartWithDetails.length > 0;

  const visibleItems = useMemo(() => {
    if (activeCategoryId === "all") {
      return menuCategories.flatMap((cat) => cat.items);
    }
    const cat = menuCategories.find((c) => c.id === activeCategoryId);
    return cat ? cat.items : [];
  }, [menuCategories, activeCategoryId]);

  const addItem = (itemId: string) => {
    setCart((prev) => {
      const existing = prev.find((e) => e.itemId === itemId);
      if (existing) {
        return prev.map((e) =>
          e.itemId === itemId ? { ...e, quantity: e.quantity + 1 } : e,
        );
      }
      return [...prev, { itemId, quantity: 1 }];
    });
  };

  const changeQuantity = (itemId: string, delta: number) => {
    if (!delta) return;
    setCart((prev) =>
      prev
        .map((e) =>
          e.itemId === itemId ? { ...e, quantity: e.quantity + delta } : e,
        )
        .filter((e) => e.quantity > 0),
    );
  };

  const clearCart = () => {
    setCart([]);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(POS_DISPLAY_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  };

  // ⭐ 同步当前订单到顾客显示屏（localStorage）
  useEffect(() => {
    if (typeof window === "undefined") return;

    const snapshot: PosDisplaySnapshot = {
      items: cartWithDetails.map((item) => ({
        id: item.itemId,
        nameZh: item.def.i18n.zh.name,
        nameEn: item.def.i18n.en.name,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        lineTotalCents: item.lineTotalCents,
      })),
      subtotalCents,
      taxCents,
      totalCents,
    };

    try {
      if (snapshot.items.length === 0) {
        window.localStorage.removeItem(POS_DISPLAY_STORAGE_KEY);
      } else {
        window.localStorage.setItem(
          POS_DISPLAY_STORAGE_KEY,
          JSON.stringify(snapshot),
        );
      }
    } catch (err) {
      console.warn("Failed to write POS display snapshot:", err);
    }
  }, [cartWithDetails, subtotalCents, taxCents, totalCents]);

  // 👉 现在：只负责跳转到支付界面（在支付页选择堂食/外带 + 付款方式）
  // 同时受 storeStatus.isOpen 控制（管理端 / POS 的暂停开关统一生效）
  const handlePlaceOrder = () => {
    if (!hasItems || !isStoreOpen) return;
    setIsPlacing(true);
    router.push(`/${locale}/store/pos/payment`);
  };

  return (
    <main className="min-h-screen bg-slate-900 text-slate-50">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
        <div>
          <h1 className="text-2xl font-semibold">{t.title}</h1>
          <p className="text-sm text-slate-300">{t.subtitle}</p>
          {storeStatusDetail && (
            <p className="mt-1 max-w-xl text-xs text-rose-200">
              {storeStatusDetail}
            </p>
          )}
          {storeStatusError && (
            <p className="mt-1 max-w-xl text-[11px] text-amber-300">
              {t.storeStatusError}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {storeStatusLoading ? (
            <span className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs text-slate-200">
              {t.storeStatusLoading}
            </span>
          ) : (
            <span
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                isStoreOpen
                  ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-200"
                  : "border-rose-400/60 bg-rose-500/10 text-rose-200"
              }`}
            >
              {isStoreOpen ? t.storeStatusOpen : t.storeStatusClosed}
            </span>
          )}
        </div>
      </header>

      <section className="flex gap-4 p-4 h-[calc(100vh-4rem)]">
        {/* 左侧：菜单（大按钮） */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 分类切换 */}
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setActiveCategoryId("all")}
              className={`px-4 py-2 rounded-2xl text-sm font-medium ${
                activeCategoryId === "all"
                  ? "bg-slate-100 text-slate-900"
                  : "bg-slate-800 text-slate-100"
              }`}
            >
              {t.categoriesAll}
            </button>
            {menuCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategoryId(cat.id)}
                className={`px-4 py-2 rounded-2xl text-sm font-medium ${
                  activeCategoryId === cat.id
                    ? "bg-slate-100 text-slate-900"
                    : "bg-slate-800 text-slate-100"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* 菜品大按钮区 */}
          <div className="flex-1 overflow-auto pr-1">
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3 auto-rows-[150px]">
              {visibleItems.map((item) => {
                const unitPriceCents = Math.round(item.price * 100);
                const currentQty =
                  cart.find((e) => e.itemId === item.id)?.quantity ?? 0;

                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => addItem(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        addItem(item.id);
                      }
                    }}
                    className="flex flex-col justify-between rounded-3xl bg-slate-800 hover:bg-slate-700 active:scale-[0.99] transition-transform p-3 text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-lg leading-snug">
                        {item.name}
                      </div>
                      <div className="text-base font-bold">
                        {formatMoney(unitPriceCents)}
                      </div>
                    </div>

                    {/* 原本这里有描述，现在去掉描述行，只保留“点击添加”提示和数量控制 */}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[11px] text-slate-400">
                        {t.tapToAdd}
                      </span>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            changeQuantity(item.id, -1);
                          }}
                          className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-lg leading-none"
                        >
                          −
                        </button>

                        <span className="min-w-[2ch] text-center text-base font-semibold text-white">
                          {currentQty ?? 0}
                        </span>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            changeQuantity(item.id, +1);
                          }}
                          className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-lg leading-none"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 右侧：购物车部分（收银员屏） */}
        <div className="w-full max-w-md flex flex-col rounded-3xl bg-slate-800/80 border border-slate-700 p-4">
          <h2 className="text-lg font-semibold mb-2">{t.cartTitle}</h2>

          <div className="flex-1 overflow-auto pr-1">
            {cartWithDetails.length === 0 ? (
              <div className="mt-8 text中心 text-slate-400 text-sm">
                {t.emptyCart}
              </div>
            ) : (
              <ul className="space-y-2">
                {cartWithDetails.map((item) => (
                  <li
                    key={item.itemId}
                    className="flex items-center justify-between gap-2 rounded-2xl bg-slate-900/60 px-3 py-2"
                  >
                    <div className="flex-1">
                      <div className="text-sm font-medium">
                        {item.localized.name}
                      </div>
                      <div className="text-xs text-slate-400">
                        {t.qtyLabel}: {item.quantity}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => changeQuantity(item.itemId, -1)}
                        className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-lg leading-none"
                      >
                        −
                      </button>
                      <span className="min-w-[1.5rem] text-center text-sm font-semibold">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => changeQuantity(item.itemId, 1)}
                        className="w-8 h-8 rounded-full bg-emerald-500 text-slate-900 flex items-center justify-center text-lg leading-none"
                      >
                        +
                      </button>
                    </div>
                    <div className="w-20 text-right text-sm font-semibold">
                      {formatMoney(item.lineTotalCents)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4 border-t border-slate-700 pt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-300">{t.subtotal}</span>
              <span>{formatMoney(subtotalCents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-300">{t.tax}</span>
              <span>{formatMoney(taxCents)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>{t.total}</span>
              <span>{formatMoney(totalCents)}</span>
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={clearCart}
              className="flex-1 h-12 rounded-2xl border border-slate-600 text-sm font-medium hover:bg-slate-700"
            >
              {t.clearCart}
            </button>
            <button
              type="button"
              disabled={!hasItems || isPlacing || !isStoreOpen}
              onClick={handlePlaceOrder}
              className={`flex-[1.5] h-12 rounded-2xl text-sm font-semibold ${
                !hasItems || isPlacing || !isStoreOpen
                  ? "bg-slate-500 text-slate-200"
                  : "bg-emerald-500 text-slate-900 hover:bg-emerald-400"
              }`}
            >
              {isPlacing ? t.placing : t.placeOrder}
            </button>
          </div>
        </div>
      </section>

      {/* 订单完成弹窗（暂时只有以后真正创建订单时才会用到） */}
      {lastOrderInfo && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-700 p-6 text-center">
            <h3 className="text-lg font-semibold mb-2">{t.successTitle}</h3>
            <p className="text-sm text-slate-300 mb-3">{t.successBody}</p>
            <div className="mb-4 space-y-1 text-sm">
              <div>
                {isZh ? "订单号：" : "Order:"}{" "}
                <span className="font-mono font-semibold">
                  {lastOrderInfo.orderNumber}
                </span>
              </div>
              {lastOrderInfo.pickupCode && (
                <div>
                  {isZh ? "取餐码：" : "Pickup code:"}{" "}
                  <span className="font-mono font-bold text-2xl">
                    {lastOrderInfo.pickupCode}
                  </span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setLastOrderInfo(null)}
              className="mt-2 inline-flex items-center justify-center px-4 py-2 rounded-2xl bg-slate-100 text-slate-900 text-sm font-medium hover:bg-white"
            >
              {t.close}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function menuItemFromDef(
  def: MenuItemDefinition,
  locale: Locale,
): LocalizedMenuItem {
  const t = def.i18n[locale];
  return {
    id: def.id,
    name: t.name,
    description: t.description,
    price: def.price,
    calories: def.calories,
    tags: def.tags ?? [],
  };
}
