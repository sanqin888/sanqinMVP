// /Users/apple/sanqinMVP/apps/web/src/app/[locale]/store/board/page.tsx

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { Locale } from "@/lib/i18n/locales";
import { apiFetch } from "@/lib/api/client";
import { advanceOrder } from "@/lib/api/pos";
import { parseBackendDateMs } from "@/lib/time/tz";

type BoardOrderItem = {
  id: string;
  productId: string;
  qty: number;
  displayName?: string | null;
  nameEn?: string | null;
  nameZh?: string | null;
  unitPriceCents?: number | null;
};

type BoardOrder = {
  // 说明：后端可能仍返回 id，但本页面完全不依赖它
  id?: string;

  // ✅ stableId 为非空字段：本页去重 / 打印 / 推进状态全用它
  orderStableId: string;
  orderNumber?: string;

  channel: "web" | "in_store" | "ubereats";
  status: "paid" | "making" | "ready" | "completed" | "refunded";

  subtotalCents: number;
  taxCents: number;
  deliveryFeeCents?: number | null;
  totalCents: number;

  pickupCode?: string | null;
  createdAt: string;

  items: BoardOrderItem[];
};

function formatMoney(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100;
  return `$${value.toFixed(2)}`;
}

function formatStatus(status: BoardOrder["status"], locale: Locale): string {
  const isZh = locale === "zh";
  switch (status) {
    case "paid":
      return isZh ? "已支付" : "Paid";
    case "making":
      return isZh ? "制作中" : "In progress";
    case "ready":
      return isZh ? "可取餐" : "Ready for pickup";
    case "completed":
      return isZh ? "已完成" : "Completed";
    case "refunded":
      return isZh ? "已退款" : "Refunded";
    default:
      return status;
  }
}

function formatChannel(channel: BoardOrder["channel"], locale: Locale): string {
  const isZh = locale === "zh";
  switch (channel) {
    case "web":
      return isZh ? "线上订单" : "Online";
    case "in_store":
      return isZh ? "店内点单" : "In-store";
    case "ubereats":
      return isZh ? "UberEats 平台" : "UberEats";
    default:
      return channel;
  }
}

function pickItemName(item: BoardOrderItem, locale: Locale): string {
  const trimmedDisplay = item.displayName?.trim() ?? "";
  const trimmedEn = item.nameEn?.trim() ?? "";
  const trimmedZh = item.nameZh?.trim() ?? "";

  if (locale === "zh") {
    return trimmedZh || trimmedDisplay || trimmedEn || item.productId;
  }
  return trimmedEn || trimmedDisplay || trimmedZh || item.productId;
}

// 浏览器语音提醒
function speak(text: string, locale: Locale) {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = locale === "zh" ? "zh-CN" : "en-US";
  window.speechSynthesis.speak(utterance);
}

const STRINGS = {
  zh: {
    title: "门店订单看板",
    subtitle: "显示最近 3 小时的线上/店内订单，新线上订单会语音提醒并自动打印。",
    localeLabel: "界面语言路径",
    statusLabel: "状态",
    orderIdLabel: "订单号",
    pickupCodeLabel: "取餐码",
    totalLabel: "合计",
    connected: "已连接",
    refreshing: "刷新中…",
    noOrders: "暂无订单。",
    acceptOrder: "接单",
    terminal: "终态",
    reprintFront: "重打前台",
    printKitchen: "后厨小票",
    voiceOne: "有一个新的线上订单。",
    voiceMany: (n: number) => `有 ${n} 个新的线上订单。`,
  },
  en: {
    title: "Store Order Board",
    subtitle:
      "Showing online and in-store orders from the last 3 hours. New online orders will be announced and auto-printed.",
    localeLabel: "Locale",
    statusLabel: "Status",
    orderIdLabel: "Order",
    pickupCodeLabel: "Pickup code",
    totalLabel: "Total",
    connected: "Connected",
    refreshing: "Refreshing…",
    noOrders: "No orders yet.",
    acceptOrder: "Accept",
    terminal: "Terminal",
    reprintFront: "Reprint front",
    printKitchen: "Kitchen ticket",
    voiceOne: "New online order.",
    voiceMany: (n: number) => `${n} new online orders.`,
  },
} as const;

const NEXT_STATUS: Record<BoardOrder["status"], BoardOrder["status"] | null> = {
  paid: "making",
  making: "ready",
  ready: "completed",
  completed: null,
  refunded: null,
};

// ==============================
// ✅ “刷新也不重复打印”的持久化去重
// - localStorage 记录“已处理（已打印/已见过）”的 orderStableId
// - TTL 清理，避免无限增长
// - 首次拉取仅做 baseline（不打印），之后才对增量订单自动打印 + 语音
// ==============================

const PRINTED_STORAGE_KEY = "sanqin:storeBoard:processedStableIds:v1";
// 看板展示最近 3 小时，这里给足冗余：12 小时内都认为“已处理”，避免短时间内反复打印
const PRINTED_TTL_MS = 12 * 60 * 60 * 1000;

type ProcessedMap = Record<string, number>; // stableId -> timestamp(ms)

function readProcessedMap(): ProcessedMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PRINTED_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const now = Date.now();
    const next: ProcessedMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const ts =
        typeof v === "number"
          ? v
          : typeof v === "string"
            ? Number(v)
            : NaN;
      if (!Number.isFinite(ts)) continue;
      if (now - ts > PRINTED_TTL_MS) continue;
      next[k] = ts;
    }
    return next;
  } catch {
    return {};
  }
}

function writeProcessedMap(map: ProcessedMap) {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    const pruned: ProcessedMap = {};
    for (const [k, ts] of Object.entries(map)) {
      if (!Number.isFinite(ts)) continue;
      if (now - ts > PRINTED_TTL_MS) continue;
      pruned[k] = ts;
    }
    window.localStorage.setItem(PRINTED_STORAGE_KEY, JSON.stringify(pruned));
  } catch {
    // ignore quota / privacy mode
  }
}

function safeParseCreatedAtMs(createdAt: string): number {
  const ms = parseBackendDateMs(createdAt);
  return Number.isFinite(ms) ? ms : Date.now();
}

function shouldShowOnBoard(order: BoardOrder): boolean {
  return Array.isArray(order.items) && order.items.length > 0;
}

export default function StoreBoardPage() {
  const params = useParams();
  const locale = (params?.locale as Locale) ?? "zh";
  const isZh = locale === "zh";
  const t = STRINGS[locale];

  const [orders, setOrders] = useState<BoardOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const processedRef = useRef<ProcessedMap>({});
  const processedSetRef = useRef<Set<string>>(new Set());
  const hasBootstrappedRef = useRef(false);

  const query =
    "/pos/orders/board?status=paid,making,ready&sinceMinutes=180&limit=80";

  const handlePrintFront = useCallback((orderStableId: string) => {
    const prefix = `/${locale}`;
    window.open(
      `${prefix}/store/print/front/${orderStableId}`,
      "_blank",
      "width=480,height=800",
    );
  }, [locale]);

  const handlePrintKitchen = useCallback((orderStableId: string) => {
    const prefix = `/${locale}`;
    window.open(
      `${prefix}/store/print/kitchen/${orderStableId}`,
      "_blank",
      "width=480,height=800",
    );
  }, [locale]);

  const fetchOrdersAndProcess = useCallback(async () => {
    const data = await apiFetch<BoardOrder[]>(query);
    const visibleOrders = data.filter(shouldShowOnBoard);

    setOrders(visibleOrders);

    const processedSet = processedSetRef.current;
    const processedMap = processedRef.current;

    // ✅ 首次拉取：只做 baseline（标记为已处理），避免“打开/刷新页面就把历史订单全再打印一次”
    if (!hasBootstrappedRef.current) {
      for (const o of visibleOrders) {
        const sid = o.orderStableId;
        processedSet.add(sid);
        if (!processedMap[sid]) {
          processedMap[sid] = safeParseCreatedAtMs(o.createdAt);
        }
      }
      writeProcessedMap(processedMap);
      hasBootstrappedRef.current = true;
      return;
    }

    // ✅ 增量：只对“新的 stableId”进行自动打印
    const newOrders = visibleOrders.filter(
      (o) => !processedSet.has(o.orderStableId),
    );

    if (newOrders.length > 0) {
      for (const o of newOrders) {
        const sid = o.orderStableId;
        processedSet.add(sid);
        processedMap[sid] = safeParseCreatedAtMs(o.createdAt);

        // 自动打印：前台 + 后厨各一次
        handlePrintFront(sid);
        handlePrintKitchen(sid);
      }

      writeProcessedMap(processedMap);

      // 新线上 paid 订单：语音提醒
      const newWebOrders = newOrders.filter(
        (o) => o.channel === "web" && o.status === "paid",
      );

      if (newWebOrders.length > 0) {
        const count = newWebOrders.length;
        const text = count === 1 ? t.voiceOne : t.voiceMany(count);
        speak(text, locale);
      }
    }
  }, [handlePrintFront, handlePrintKitchen, locale, query, t]);

  // 初始化：读取 localStorage，确保刷新后不重复打印
  useEffect(() => {
    const map = readProcessedMap();
    processedRef.current = map;
    processedSetRef.current = new Set(Object.keys(map));
    // 注意：hasBootstrappedRef 仍为 false；首次 fetch 只 baseline，不会打印
  }, []);

  // 轮询获取订单
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setIsLoading(true);
        await fetchOrdersAndProcess();
      } catch (error) {
        if (!cancelled) console.error("Failed to fetch board orders:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    // 先拉一次
    void run();

    // 每 5 秒轮询
    const timer = window.setInterval(() => {
      void run();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // 仅 locale 变化时重建轮询（打印 URL 依赖 locale）
  }, [fetchOrdersAndProcess]);

  const handleAdvance = async (orderStableId: string) => {
    try {
      await advanceOrder(orderStableId);
      await fetchOrdersAndProcess();
    } catch (error) {
      console.error("Failed to advance order:", error);
      alert(
        isZh
          ? "推进订单状态失败，请稍后重试。"
          : "Failed to update order status. Please try again.",
      );
    }
  };

  return (
    <main className="min-h-screen bg-slate-900 text-slate-50">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
        <div>
          <h1 className="text-2xl font-semibold">{t.title}</h1>
          <p className="text-sm text-slate-300">{t.subtitle}</p>
        </div>
        <div className="text-right text-sm text-slate-300">
          <div>
            {t.localeLabel}: {locale}
          </div>
          <div>{isLoading ? t.refreshing : t.connected}</div>
        </div>
      </header>

      <section className="p-4 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {orders.map((order) => {
          const stableId = order.orderStableId;
          const displayOrderNumber = order.orderNumber ?? stableId;
          const isWeb = order.channel === "web";
          const nextStatus = NEXT_STATUS[order.status];
          const advanceLabel = nextStatus
            ? order.status === "paid"
              ? t.acceptOrder
              : formatStatus(nextStatus, locale)
            : t.terminal;

          return (
            <div
              key={stableId}
              className={[
                "rounded-2xl border p-3 flex flex-col gap-2",
                isWeb
                  ? "border-amber-400 bg-slate-800/80"
                  : "border-slate-700 bg-slate-800/60",
              ].join(" ")}
            >
              {/* 顶部：订单号 / 取餐码 / 状态 */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400">{t.orderIdLabel}</div>
                  <div className="text-sm font-medium text-slate-200">
                    {displayOrderNumber}
                  </div>

                  {order.pickupCode && (
                    <div className="mt-2 text-sm text-emerald-300">
                      {t.pickupCodeLabel}：
                      <span className="ml-1 text-3xl font-bold text-emerald-200">
                        {order.pickupCode}
                      </span>
                    </div>
                  )}

                  <div className="mt-2 text-sm font-medium text-slate-100">
                    {t.statusLabel}: {formatStatus(order.status, locale)}
                  </div>
                </div>

                <div className="text-right text-sm">
                  <div className="px-2 py-1 rounded-full bg-slate-700/80 text-xs inline-block mb-1">
                    {formatChannel(order.channel, locale)}
                  </div>
                  <div className="text-slate-400 mt-1">
                    {t.totalLabel}: {formatMoney(order.totalCents)}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-700 my-1" />

              {/* 菜品列表 */}
              <ul className="space-y-1 text-sm max-h-40 overflow-auto pr-1">
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-2">
                    <span>
                      x{item.qty} · {pickItemName(item, locale)}
                    </span>
                    {typeof item.unitPriceCents === "number" && (
                      <span className="text-slate-300 whitespace-nowrap">
                        {formatMoney(item.unitPriceCents * item.qty)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              {/* 按钮区 */}
              <div className="mt-2 flex gap-2 justify-between">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleAdvance(stableId)}
                    className={[
                      "rounded-md border px-4 py-2 text-sm font-semibold transition",
                      nextStatus
                        ? "border-slate-500 bg-slate-900/40 text-slate-100 hover:bg-slate-800/60"
                        : "cursor-not-allowed border-slate-700 bg-slate-900/60 text-slate-500",
                    ].join(" ")}
                    disabled={!nextStatus}
                  >
                    {advanceLabel}
                  </button>

                  {/* ✅ 新增：重打前台票据（只打印前台） */}
                  <button
                    type="button"
                    onClick={() => handlePrintFront(stableId)}
                    className="rounded-md border border-slate-500 bg-slate-900/40 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800/60 transition"
                  >
                    {t.reprintFront}
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handlePrintKitchen(stableId)}
                    className="px-2.5 py-1.5 rounded-full text-xs bg-slate-700 hover:bg-slate-600"
                  >
                    {t.printKitchen}
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {orders.length === 0 && (
          <div className="col-span-full text-center text-slate-300 mt-12">
            {t.noOrders}
          </div>
        )}
      </section>
    </main>
  );
}
