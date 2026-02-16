//Users/apple/sanqinMVP/apps/web/src/components/store/StoreBoardWidget.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/locales";
import { apiFetch } from "@/lib/api/client";
import { advanceOrder, printOrderCloud } from "@/lib/api/pos";
import { parseBackendDateMs } from "@/lib/time/tz";

const ALARM_LOOP_SRC = "/sounds/pos-alarm-loop.mp3";

type BoardOrderItem = {
  productStableId: string
  qty: number;
  displayName?: string | null;
  nameEn?: string | null;
  nameZh?: string | null;
  unitPriceCents?: number | null;
};


type BoardOrder = {
  orderStableId: string; // ✅ 非空

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
  const v = (cents ?? 0) / 100;
  return `$${v.toFixed(2)}`;
}

function pickItemName(item: BoardOrderItem, locale: Locale): string {
  const trimmedDisplay = item.displayName?.trim() ?? "";
  const trimmedEn = item.nameEn?.trim() ?? "";
  const trimmedZh = item.nameZh?.trim() ?? "";
  if (locale === "zh") return trimmedZh || trimmedDisplay || trimmedEn || item.productStableId;
  return trimmedEn || trimmedDisplay || trimmedZh || item.productStableId;
}

function formatStatus(status: BoardOrder["status"], locale: Locale): string {
  const isZh = locale === "zh";
  switch (status) {
    case "paid":
      return isZh ? "已支付" : "Paid";
    case "making":
      return isZh ? "制作中" : "In progress";
    case "ready":
      return isZh ? "可取餐" : "Ready";
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
      return isZh ? "线上" : "Online";
    case "in_store":
      return isZh ? "店内" : "In-store";
    case "ubereats":
      return isZh ? "UberEats" : "UberEats";
    default:
      return channel;
  }
}

// 浏览器语音提醒
function speak(
  text: string,
  locale: Locale,
  onEnd?: () => void,
) {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = locale === "zh" ? "zh-CN" : "en-US";
  if (onEnd) {
    utter.onend = onEnd;
  }
  window.speechSynthesis.speak(utter);
}

const STRINGS = {
  zh: {
    title: "订单看板",
    connected: "已连接",
    refreshing: "刷新中…",
    collapse: "收起",
    noOrders: "暂无订单",
    statusLabel: "状态",
    totalLabel: "合计",
    pickupCodeLabel: "取餐码",
    acceptOrder: "接单",
    terminal: "终态",
    reprintFront: "重打前台",
    printKitchen: "后厨小票",
    voiceOne: "有一个新的线上订单。",
    voiceMany: (n: number) => `有 ${n} 个新的线上订单。`,
  },
  en: {
    title: "Order Board",
    connected: "Connected",
    refreshing: "Refreshing…",
    collapse: "Collapse",
    noOrders: "No orders",
    statusLabel: "Status",
    totalLabel: "Total",
    pickupCodeLabel: "Pickup",
    acceptOrder: "Accept",
    terminal: "Terminal",
    reprintFront: "Reprint front",
    printKitchen: "Kitchen",
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

// ✅ 刷新不重复打印：localStorage 持久化（按 stableId）
const PRINTED_STORAGE_KEY = "sanqin:storeBoard:processedStableIds:v2";
const PRINTED_TTL_MS = 12 * 60 * 60 * 1000; // 12h
type ProcessedMap = Record<string, number>; // stableId -> timestamp(ms)

function safeParseCreatedAtMs(createdAt: string): number {
  const ms = parseBackendDateMs(createdAt);
  return Number.isFinite(ms) ? ms : Date.now();
}

function shouldShowOnBoard(order: BoardOrder): boolean {
  return Array.isArray(order.items) && order.items.length > 0;
}

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
      const ts = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
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
    // ignore
  }
}

export function StoreBoardWidget(props: { locale: Locale }) {
  const locale = props.locale ?? "zh";
  const t = STRINGS[locale];
  const isZh = locale === "zh";

  const query = useMemo(
    () => "/pos/orders/board?status=paid,making,ready&sinceMinutes=180&limit=80",
    [],
  );

  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<BoardOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);

  // ✅ 增强1：新 web 订单到达时，高亮闪烁（并自动展开）
  const [flash, setFlash] = useState(false);
  const [pop, setPop] = useState(false);
  const [highlightedOrders, setHighlightedOrders] = useState<Record<string, boolean>>({});

  const processedRef = useRef<ProcessedMap>({});
  const processedSetRef = useRef<Set<string>>(new Set());
  const hasBootstrappedRef = useRef(false);
  const hadPersistedRef = useRef(false);
  const inactivityTimerRef = useRef<number | null>(null);
  const highlightTimersRef = useRef<Record<string, number>>({});
  const alarmAudioRef = useRef<HTMLAudioElement | null>(null);
  const alarmPlayingRef = useRef(false);

  // ✅ 增强2：待接单数（只统计 web + paid）
  const webPaidCount = useMemo(
    () => orders.filter((o) => o.channel === "web" && o.status === "paid").length,
    [orders],
  );

  const activeCount = orders.length;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const audio = new Audio(ALARM_LOOP_SRC);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 1.0;
    alarmAudioRef.current = audio;

    return () => {
      try {
        audio.pause();
      } catch {}
      alarmAudioRef.current = null;
      alarmPlayingRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(false), 1400);
    return () => window.clearTimeout(timer);
  }, [flash]);

  useEffect(() => {
    if (!pop) return;
    const timer = window.setTimeout(() => setPop(false), 600);
    return () => window.clearTimeout(timer);
  }, [pop]);

  const scheduleAutoCollapse = useCallback(() => {
    if (inactivityTimerRef.current) {
      window.clearTimeout(inactivityTimerRef.current);
    }
    inactivityTimerRef.current = window.setTimeout(() => {
      setOpen(false);
    }, 30000);
  }, []);

  const startAlarmLoop = useCallback(async () => {
    if (!soundEnabled) return;
    if (alarmPlayingRef.current) return;
    const audio = alarmAudioRef.current;
    if (!audio) return;
    if (!audio.paused) return;

    try {
      await audio.play();
      alarmPlayingRef.current = true;
    } catch (error) {
      console.warn("Alarm play blocked:", error);
      alarmPlayingRef.current = false;
    }
  }, [soundEnabled]);

  const stopAlarmLoop = useCallback(() => {
    const audio = alarmAudioRef.current;
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {}
    alarmPlayingRef.current = false;
  }, []);

  const markNewOrders = useCallback((orderIds: string[]) => {
    if (orderIds.length === 0) return;
    setHighlightedOrders((prev) => {
      const next = { ...prev };
      for (const id of orderIds) {
        next[id] = true;
      }
      return next;
    });

    for (const id of orderIds) {
      if (highlightTimersRef.current[id]) {
        window.clearTimeout(highlightTimersRef.current[id]);
      }
      highlightTimersRef.current[id] = window.setTimeout(() => {
        setHighlightedOrders((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        delete highlightTimersRef.current[id];
      }, 6000);
    }
  }, []);

  // 初始化：读取 localStorage 去重集合（刷新不重复打印）
  useEffect(() => {
    const map = readProcessedMap();
    processedRef.current = map;
    processedSetRef.current = new Set(Object.keys(map));
    hadPersistedRef.current = Object.keys(map).length > 0;
  }, []);

  const handlePrintFront = useCallback(
    async (orderStableId: string) => {
      try {
        await printOrderCloud(orderStableId, { customer: true, kitchen: false });
      } catch (error) {
        console.error("Failed to print front receipt via cloud:", error);
      }
    },
    [],
  );

  const handlePrintKitchen = useCallback(
    async (orderStableId: string) => {
      try {
        await printOrderCloud(orderStableId, { customer: false, kitchen: true });
      } catch (error) {
        console.error("Failed to print kitchen ticket via cloud:", error);
      }
    },
    [],
  );

  const fetchOrdersAndProcess = useCallback(async () => {
    const data = await apiFetch<BoardOrder[]>(query);
    const visibleOrders = data.filter(shouldShowOnBoard);
    setOrders(visibleOrders);

    const processedSet = processedSetRef.current;
    const processedMap = processedRef.current;

    // ✅ 首次拉取策略：
    // - 若本机没有任何持久化记录（第一次用）：baseline，不打印历史堆积
    // - 若本机已有持久化记录（刷新/重开）：允许补打“未处理过”的新单
    if (!hasBootstrappedRef.current) {
      hasBootstrappedRef.current = true;

      if (!hadPersistedRef.current) {
        for (const o of visibleOrders) {
          const sid = o.orderStableId;
          processedSet.add(sid);
          if (!processedMap[sid]) processedMap[sid] = safeParseCreatedAtMs(o.createdAt);
        }
        writeProcessedMap(processedMap);
        return;
      }
      // hadPersistedRef = true：继续走下面正常 newOrders 逻辑（补打漏单）
    }

    const newOrders = visibleOrders.filter(
      (o) => !processedSet.has(o.orderStableId),
    );
    if (newOrders.length === 0) return;

    markNewOrders(newOrders.map((o) => o.orderStableId));

    for (const o of newOrders) {
      const sid = o.orderStableId;
      processedSet.add(sid);
      processedMap[sid] = safeParseCreatedAtMs(o.createdAt);
    }
    writeProcessedMap(processedMap);

    const newWebPaid = newOrders.filter((o) => o.channel === "web" && o.status === "paid");
    if (newWebPaid.length > 0) {
      // ✅ 增强1：自动弹开 + 闪一下
      setOpen(true);
      setFlash(true);
      setPop(true);
      scheduleAutoCollapse();

      const n = newWebPaid.length;
      stopAlarmLoop();
      speak(n === 1 ? t.voiceOne : t.voiceMany(n), locale, () => {
        void startAlarmLoop();
      });
    }
  }, [
    query,
    t,
    locale,
    markNewOrders,
    scheduleAutoCollapse,
    startAlarmLoop,
    stopAlarmLoop,
  ]);

  const handleAdvance = useCallback(
    async (orderStableId: string) => {
      try {
        await advanceOrder(orderStableId);
        await fetchOrdersAndProcess();
      } catch (error) {
        console.error("Failed to advance order:", error);
        alert(isZh ? "推进订单状态失败，请稍后重试。" : "Failed to update order status.");
      }
    },
    [fetchOrdersAndProcess, isZh],
  );

  // 轮询（✅ exhaustive-deps 通过）
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setIsLoading(true);
        await fetchOrdersAndProcess();
      } catch (e) {
        if (!cancelled) console.error("Failed to fetch board orders:", e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void run();

    const timer = window.setInterval(() => {
      void run();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [fetchOrdersAndProcess]);

  useEffect(() => {
    if (webPaidCount > 0) {
      void startAlarmLoop();
    } else {
      stopAlarmLoop();
    }
  }, [webPaidCount, startAlarmLoop, stopAlarmLoop]);

  useEffect(() => {
    if (!open) {
      if (inactivityTimerRef.current) {
        window.clearTimeout(inactivityTimerRef.current);
      }
      return;
    }
    scheduleAutoCollapse();
  }, [open, scheduleAutoCollapse]);

  useEffect(() => {
    return () => {
      if (inactivityTimerRef.current) {
        window.clearTimeout(inactivityTimerRef.current);
      }
      for (const timer of Object.values(highlightTimersRef.current)) {
        window.clearTimeout(timer);
      }
      highlightTimersRef.current = {};
    };
  }, []);

  const handleUserActivity = useCallback(() => {
    if (!open) return;
    scheduleAutoCollapse();
  }, [open, scheduleAutoCollapse]);

  return (
    <div className="fixed bottom-4 right-4 z-30 pointer-events-none">
      {!open && (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            scheduleAutoCollapse();
          }}
          className={[
            "pointer-events-auto rounded-full border text-slate-100 px-4 py-2 shadow-lg transition",
            "bg-slate-900/90 border-slate-700 hover:bg-slate-800/90",
            flash ? "ring-2 ring-amber-400/70 shadow-amber-500/20" : "",
          ].join(" ")}
        >
          <span className="font-semibold">{t.title}</span>
          <span className="ml-2 text-slate-300 text-sm">· {activeCount}</span>

          {webPaidCount > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-rose-400/60 bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-200">
              <span className="text-[10px] leading-none">●</span>
              <span>{webPaidCount}</span>
            </span>
          )}
        </button>
      )}

      {open && (
        <div
          className={[
            "pointer-events-auto w-[420px] max-w-[calc(100vw-2rem)] h-[640px] max-h-[calc(100vh-2rem)]",
            "rounded-2xl border bg-slate-900/95 shadow-2xl overflow-hidden transition-transform duration-300",
            flash ? "border-amber-400/70 ring-2 ring-amber-400/40" : "border-slate-700",
            pop ? "scale-[1.03]" : "scale-100",
          ].join(" ")}
          onMouseMove={handleUserActivity}
          onWheel={handleUserActivity}
          onKeyDown={handleUserActivity}
          onTouchStart={handleUserActivity}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <div className="text-base font-semibold text-slate-100">{t.title}</div>

                {webPaidCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/60 bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-200">
                    <span className="text-[10px] leading-none">●</span>
                    <span>{webPaidCount}</span>
                  </span>
                )}
              </div>

              <div className="text-xs text-slate-400">
                {isLoading ? t.refreshing : t.connected} · {activeCount}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  setSoundEnabled(true);
                  try {
                    const audio = alarmAudioRef.current;
                    if (audio) {
                      await audio.play();
                      audio.pause();
                      audio.currentTime = 0;
                    }
                  } catch (error) {
                    console.warn("Sound unlock failed:", error);
                  }
                }}
                className={[
                  "ml-2 rounded-full border px-3 py-1 text-xs font-semibold transition",
                  soundEnabled
                    ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200"
                    : "border-slate-600 bg-slate-800/60 text-slate-200 hover:bg-slate-800",
                ].join(" ")}
              >
                {soundEnabled
                  ? isZh
                    ? "声音已启用"
                    : "Sound on"
                  : isZh
                    ? "启用声音"
                    : "Enable sound"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-slate-700 bg-slate-950/40 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800/50 transition"
              >
                {t.collapse}
              </button>
            </div>
          </div>

          <div className="p-3 space-y-3 overflow-auto h-[calc(640px-56px)] max-h-[calc(100vh-2rem-56px)]">
            {orders.length === 0 && (
              <div className="text-center text-slate-400 py-10">{t.noOrders}</div>
            )}

            {orders.map((order) => {
              const sid = order.orderStableId;
              const next = NEXT_STATUS[order.status];
              const advanceLabel = next
                ? order.status === "paid"
                  ? t.acceptOrder
                  : formatStatus(next, locale)
                : t.terminal;

              const isWeb = order.channel === "web";

              return (
                <div
                  key={sid}
                  className={[
                    "rounded-2xl border p-3 bg-slate-950/30",
                    isWeb ? "border-amber-400/70" : "border-slate-800",
                    highlightedOrders[sid] ? "animate-pulse ring-2 ring-amber-400/40" : "",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-slate-400">{sid}</div>

                      {order.pickupCode && (
                        <div className="mt-2 text-sm text-emerald-300">
                          {t.pickupCodeLabel}：
                          <span className="ml-1 text-2xl font-bold text-emerald-200">
                            {order.pickupCode}
                          </span>
                        </div>
                      )}

                      <div className="mt-2 text-sm text-slate-100">
                        {t.statusLabel}: {formatStatus(order.status, locale)}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="px-2 py-1 rounded-full bg-slate-800 text-xs text-slate-200 inline-block">
                        {formatChannel(order.channel, locale)}
                      </div>
                      <div className="text-slate-300 mt-2 text-sm">
                        {t.totalLabel}: {formatMoney(order.totalCents)}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-800 my-2" />

<ul className="space-y-1 text-sm max-h-28 overflow-auto pr-1">
  {order.items.map((item, idx) => (
    <li key={`${sid}:${idx}`} className="flex justify-between gap-2">
      <span className="truncate">
        x{item.qty} · {pickItemName(item, locale)}
      </span>
      {typeof item.unitPriceCents === "number" && (
        <span className="text-slate-400 whitespace-nowrap">
          {formatMoney(item.unitPriceCents * item.qty)}
        </span>
      )}
    </li>
  ))}
</ul>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleAdvance(sid)}
                      disabled={!next}
                      className={[
                        "rounded-md border px-3 py-2 text-sm font-semibold transition",
                        next
                          ? "border-slate-600 bg-slate-950/30 text-slate-100 hover:bg-slate-800/60"
                          : "cursor-not-allowed border-slate-800 bg-slate-950/30 text-slate-600",
                      ].join(" ")}
                    >
                      {advanceLabel}
                    </button>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handlePrintFront(sid)}
                        className="rounded-full bg-slate-800 hover:bg-slate-700 px-3 py-2 text-xs text-slate-100 transition"
                      >
                        {t.reprintFront}
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePrintKitchen(sid)}
                        className="rounded-full bg-slate-800 hover:bg-slate-700 px-3 py-2 text-xs text-slate-100 transition"
                      >
                        {t.printKitchen}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
