//Users/apple/sanqinMVP/apps/web/src/app/[locale]/store/board/page.tsx

"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { Locale } from "@/lib/order/shared";
import { apiFetch } from "@/lib/api-client";

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
  id: string;
  orderStableId?: string | null;
  channel: "web" | "in_store" | "ubereats";
  status: "pending" | "paid" | "making" | "ready" | "completed" | "refunded";
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
    case "pending":
      return isZh ? "待确认" : "Pending";
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
      return isZh ? "线上下单" : "Online";
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
    subtitle: "显示最近 3 小时的线上/店内订单，新线上订单会语音提醒。",
    localeLabel: "界面语言路径",
    statusLabel: "状态",
    orderIdLabel: "订单号",
    pickupCodeLabel: "取餐码",
    totalLabel: "合计",
    connected: "已连接",
    refreshing: "刷新中…",
    noOrders: "暂无订单。",
    advance: "推进状态",
    printFront: "前台小票",
    printKitchen: "后厨小票",
    voiceOne: "有一个新的线上订单。",
    voiceMany: (n: number) => `有 ${n} 个新的线上订单。`,
  },
  en: {
    title: "Store Order Board",
    subtitle: "Showing online and in-store orders from the last 3 hours. New online orders will be announced.",
    localeLabel: "Locale",
    statusLabel: "Status",
    orderIdLabel: "Order",
    pickupCodeLabel: "Pickup code",
    totalLabel: "Total",
    connected: "Connected",
    refreshing: "Refreshing…",
    noOrders: "No orders yet.",
    advance: "Next status",
    printFront: "Front receipt",
    printKitchen: "Kitchen ticket",
    voiceOne: "New online order.",
    voiceMany: (n: number) => `${n} new online orders.`,
  },
} as const;

export default function StoreBoardPage() {
  const params = useParams();
  const locale = (params?.locale as Locale) ?? "zh";
  const isZh = locale === "zh";
  const t = STRINGS[locale];

  const [orders, setOrders] = useState<BoardOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const knownIdsRef = useRef<Set<string>>(new Set());

  // 轮询获取订单
  useEffect(() => {
    let cancelled = false;

    const fetchOrders = async () => {
      try {
        setIsLoading(true);
        const query =
          "/orders/board?status=pending,paid,making,ready&sinceMinutes=180&limit=80";
        const data = await apiFetch<BoardOrder[]>(query);

        if (cancelled) return;

        setOrders(data);

        // 新的线上订单（paid），只提醒一次
        const known = knownIdsRef.current;
        const newWebOrders = data.filter(
          (o) =>
            o.channel === "web" &&
            o.status === "paid" &&
            !known.has(o.id),
        );

        if (newWebOrders.length > 0) {
          newWebOrders.forEach((o) => known.add(o.id));
          const count = newWebOrders.length;
          const text = count === 1 ? t.voiceOne : t.voiceMany(count);
          speak(text, locale);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to fetch board orders:", error);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    // 先拉一次
    void fetchOrders();

    // 每 5 秒轮询
    const timer = window.setInterval(() => {
      void fetchOrders();
    }, 5000);

    // 清理
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [t, locale]);

  const refreshBoard = async () => {
    try {
      const query =
        "/orders/board?status=pending,paid,making,ready&sinceMinutes=180&limit=80";
      const data = await apiFetch<BoardOrder[]>(query);
      setOrders(data);
    } catch (error) {
      console.error("Failed to refresh board:", error);
    }
  };

  const handleAdvance = async (orderId: string) => {
    try {
      await apiFetch(`/orders/${orderId}/advance`, { method: "POST" });
      await refreshBoard();
    } catch (error) {
      console.error("Failed to advance order:", error);
      alert(
        isZh
          ? "推进订单状态失败，请稍后重试。"
          : "Failed to update order status. Please try again.",
      );
    }
  };

  const handlePrintFront = (orderId: string) => {
    const prefix = `/${locale}`;
    window.open(
      `${prefix}/store/print/front/${orderId}`,
      "_blank",
      "width=480,height=800",
    );
  };

  const handlePrintKitchen = (orderId: string) => {
    const prefix = `/${locale}`;
    window.open(
      `${prefix}/store/print/kitchen/${orderId}`,
      "_blank",
      "width=480,height=800",
    );
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
          const orderNumber = order.orderStableId ?? order.id;
          const isWeb = order.channel === "web";
          const isPending = order.status === "pending";

          return (
            <div
              key={order.id}
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
                  <div className="text-xs text-slate-400">
                    {t.orderIdLabel}
                  </div>
                  <div className="text-lg font-semibold">{orderNumber}</div>
                  {order.pickupCode && (
                    <div className="mt-1 text-sm text-emerald-300">
                      {t.pickupCodeLabel}：
                      <span className="font-bold text-xl">
                        {order.pickupCode}
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-right text-sm">
                  <div className="px-2 py-1 rounded-full bg-slate-700/80 text-xs inline-block mb-1">
                    {formatChannel(order.channel, locale)}
                  </div>
                  <div className="font-medium">
                    {t.statusLabel}: {formatStatus(order.status, locale)}
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
                    onClick={() => handleAdvance(order.id)}
                    className={[
                      "px-3 py-1.5 rounded-full text-xs font-medium",
                      isPending
                        ? "bg-emerald-500 text-slate-900 hover:bg-emerald-400"
                        : "bg-slate-600 text-slate-100 hover:bg-slate-500",
                    ].join(" ")}
                  >
                    {t.advance}
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handlePrintFront(order.id)}
                    className="px-2.5 py-1.5 rounded-full text-xs bg-slate-700 hover:bg-slate-600"
                  >
                    {t.printFront}
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrintKitchen(order.id)}
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
