// apps/web/src/components/store/ScheduledOrdersRail.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import type { Locale } from "@/lib/i18n/locales";

export type ScheduledOrderSummary = {
  orderStableId: string;
  orderNumber: string;
  channel: "web" | "in_store" | "ubereats";
  productionStartAt: string;
  scheduledFor: string;
  itemCount: number;
};

export type ScheduledOrdersRailStatus = "loading" | "ready" | "error";

function channelLabel(channel: ScheduledOrderSummary["channel"]): string {
  switch (channel) {
    case "ubereats":
      return "Uber Eats";
    case "web":
      return "SanQ.ca";
    case "in_store":
      return "POS";
    default:
      return channel;
  }
}

function formatClock(value: string, locale: Locale): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CA" : "en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatCountdown(target: string, nowMs: number, locale: Locale): string {
  const targetMs = new Date(target).getTime();
  if (!Number.isFinite(targetMs))
    return locale === "zh" ? "时间待确认" : "Time pending";

  const minutes = Math.ceil((targetMs - nowMs) / 60_000);
  if (minutes <= 0) return locale === "zh" ? "现在制作" : "Start now";
  if (minutes < 60)
    return locale === "zh" ? `${minutes} 分钟后` : `in ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (locale === "zh") {
    return rest > 0 ? `${hours} 小时 ${rest} 分后` : `${hours} 小时后`;
  }
  return rest > 0 ? `in ${hours}h ${rest}m` : `in ${hours}h`;
}

function emptyStateCopy(status: ScheduledOrdersRailStatus, isZh: boolean) {
  if (status === "loading") {
    return {
      title: isZh ? "正在加载预约订单" : "Loading scheduled orders",
      detail: isZh
        ? "正在读取当前门店的未来制作队列。"
        : "Reading this store's upcoming production queue.",
    };
  }
  if (status === "error") {
    return {
      title: isZh ? "预约队列暂不可用" : "Scheduled queue unavailable",
      detail: isZh
        ? "系统会自动重试，请勿将此状态视为暂无预约单。"
        : "The system will retry automatically; this does not mean the queue is empty.",
    };
  }
  return {
    title: isZh ? "暂无预约订单" : "No scheduled orders",
    detail: isZh
      ? "预约单会在这里按开始制作时间排列。"
      : "Scheduled orders will appear here by production start time.",
  };
}

export function ScheduledOrdersRail({
  locale,
  orders = [],
  status = "ready",
}: {
  locale: Locale;
  orders?: ScheduledOrderSummary[];
  status?: ScheduledOrdersRailStatus;
}) {
  const isZh = locale === "zh";
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const sortedOrders = useMemo(
    () =>
      [...orders].sort(
        (a, b) =>
          new Date(a.productionStartAt).getTime() -
          new Date(b.productionStartAt).getTime(),
      ),
    [orders],
  );
  const emptyCopy = emptyStateCopy(status, isZh);

  return (
    <aside className="flex h-dvh min-h-0 flex-col border-r border-slate-700 bg-slate-950 px-3 py-4 text-slate-50">
      <div className="shrink-0 border-b border-slate-800 pb-3">
        <div className="text-base font-semibold">
          {isZh ? "预约订单" : "Scheduled"}
        </div>
        <div className="mt-0.5 text-[11px] text-slate-400">
          {isZh ? "未来制作队列" : "Upcoming production"}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-3 pr-0.5">
        {sortedOrders.length === 0 ? (
          <div className="flex h-full min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 px-3 text-center">
            <div className="text-sm font-medium text-slate-300">
              {emptyCopy.title}
            </div>
            <div className="mt-1 text-[11px] leading-relaxed text-slate-500">
              {emptyCopy.detail}
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {sortedOrders.map((order) => (
              <article
                key={order.orderStableId}
                className="rounded-2xl border border-slate-700 bg-slate-900 px-3 py-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] text-slate-400">
                      {isZh ? "开始制作" : "Start"}
                    </div>
                    <div className="text-xl font-bold tabular-nums text-amber-200">
                      {formatClock(order.productionStartAt, locale)}
                    </div>
                  </div>
                  <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-300">
                    {channelLabel(order.channel)}
                  </span>
                </div>

                <div className="mt-2 rounded-xl bg-slate-800/80 px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">
                    {isZh ? "距离制作" : "Production"}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-emerald-300">
                    {formatCountdown(order.productionStartAt, nowMs, locale)}
                  </div>
                </div>

                <div className="mt-2 space-y-1 text-xs text-slate-300">
                  <div className="flex justify-between gap-2">
                    <span>{isZh ? "取餐" : "Pickup"}</span>
                    <span className="font-medium tabular-nums">
                      {formatClock(order.scheduledFor, locale)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>{isZh ? "订单" : "Order"}</span>
                    <span className="font-mono font-semibold">
                      #{order.orderNumber}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 text-slate-400">
                    <span>{isZh ? "菜品" : "Items"}</span>
                    <span>{order.itemCount}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
