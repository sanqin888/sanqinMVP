//Users/apple/sanqinMVP/apps/web/src/app/[locale]/store/pos/summary
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Locale } from "@/lib/order/shared";
import { apiFetch } from "@/lib/api-client";
import { parseBackendDate, ymdInTimeZone } from "@/lib/time/tz";

type BusinessConfigLite = { timezone: string };
const COPY = {
  zh: {
    title: "当日小结",
    subtitle: "查看今日订单与收款概览，支持打印与导出。",
    backToPos: "返回 POS 点单",
    summary: "汇总",
    summaryCards: {
      orders: "订单数",
      sales: "销售额",
      tax: "税",
      discount: "折扣",
      refund: "退款",
      net: "净额",
    },
    breakdownByPayment: "按支付方式汇总",
    breakdownByChannel: "按渠道汇总",
    printSummary: "打印汇总报表",
    printTransactions: "打印流水报表",
    exportCsv: "导出 CSV",
    filters: {
      title: "订单筛选",
      dateStart: "开始日期",
      dateEnd: "结束日期",
      channel: "渠道",
      status: "状态",
      payment: "支付方式",
      all: "全部",
    },
    loading: "加载中…",
  },
  en: {
    title: "Daily Summary",
    subtitle: "Review today’s orders and payments with print/export options.",
    backToPos: "Back to POS",
    summary: "Summary",
    summaryCards: {
      orders: "Orders",
      sales: "Sales",
      tax: "Tax",
      discount: "Discounts",
      refund: "Refunds",
      net: "Net",
    },
    breakdownByPayment: "By payment method",
    breakdownByChannel: "By channel",
    printSummary: "Print summary report",
    printTransactions: "Print transaction report",
    exportCsv: "Export CSV",
    filters: {
      title: "Order filters",
      dateStart: "Start date",
      dateEnd: "End date",
      channel: "Channel",
      status: "Status",
      payment: "Payment",
      all: "All",
    },
    loading: "Loading…",
  },
} as const;

type FilterState = {
  dateStart: string; // YYYY-MM-DD
  dateEnd: string;   // YYYY-MM-DD
  channel: string;   // pickup|dine_in|delivery
  status: string;    // paid|refunded|void
  payment: string;   // cash|card|online|unknown
};

type OrderRow = {
  orderStableId: string;
  date: string;
  channel: string; // fulfillmentType
  status: string;  // statusBucket
  payment: string; // payment bucket
  amountCents: number; // net
  clientRequestId: string;
};

type PosDailySummaryResponse = {
  timeMin: string;
  timeMax: string;
  totals: {
    orders: number;
    salesCents: number;
    taxCents: number;
    discountCents: number;
    refundCents: number;
    netCents: number;
  };
  breakdownByPayment: Array<{
    payment: "cash" | "card" | "online" | "unknown";
    count: number;
    amountCents: number;
  }>;
  breakdownByFulfillment: Array<{
    fulfillmentType: "pickup" | "dine_in" | "delivery";
    count: number;
    amountCents: number;
  }>;
  orders: Array<{
    orderStableId: string;
    clientRequestId: string | null;
    createdAt: string;

    channel: "web" | "in_store" | "ubereats";
    fulfillmentType: "pickup" | "dine_in" | "delivery";

    status: "pending" | "paid" | "making" | "ready" | "completed" | "refunded";
    statusBucket: "paid" | "refunded" | "void";

    payment: "cash" | "card" | "online" | "unknown";

    totalCents: number;
    taxCents: number;
    discountCents: number;

    refundCents: number;
    additionalChargeCents: number;

    netCents: number;
  }>;
};

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return "Failed to load summary";
  }
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  const base = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0));
  base.setUTCDate(base.getUTCDate() + days);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(base.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function getTimeZoneOffsetMillis(timeZone: string, date: Date): number {
  // offset = (same wall-clock interpreted as UTC) - (actual UTC millis)
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value;

  const year = Number(pick("year"));
  const month = Number(pick("month"));
  const day = Number(pick("day"));
  const hour = Number(pick("hour"));
  const minute = Number(pick("minute"));
  const second = Number(pick("second"));

  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtc - date.getTime();
}

function zonedMidnightToUtcIso(ymd: string, timeZone: string): string {
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  // 初始猜测：UTC 午夜
  const guess0 = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  // 迭代两次，覆盖 DST 边界
  const off0 = getTimeZoneOffsetMillis(timeZone, guess0);
  const guess1 = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - off0);
  const off1 = getTimeZoneOffsetMillis(timeZone, guess1);
  const exact = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - off1);
  return exact.toISOString();
}

function buildUtcRange(
  dateStart: string,
  dateEnd: string,
  timeZone: string,
): { timeMin: string; timeMax: string } {
  const todayYmd = ymdInTimeZone(new Date(), timeZone);
  const startYmd = dateStart || todayYmd;
  const endYmd = dateEnd || startYmd;

  const timeMin = zonedMidnightToUtcIso(startYmd, timeZone);
  // timeMax = endYmd 次日 00:00（门店时区）
  const timeMax = zonedMidnightToUtcIso(addDaysYmd(endYmd, 1), timeZone);
  return { timeMin, timeMax };
}

function downloadCsv(filename: string, csvText: string) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCsv(rows: OrderRow[]): string {
  const header = ["orderStableId", "clientRequestId", "time", "fulfillment", "status", "payment", "net"].join(",");
  const lines = rows.map((r) =>
    [
      JSON.stringify(r.orderStableId),
      JSON.stringify(r.clientRequestId),
      JSON.stringify(r.date),
      JSON.stringify(r.channel),
      JSON.stringify(r.status),
      JSON.stringify(r.payment),
      JSON.stringify((r.amountCents / 100).toFixed(2)),
    ].join(","),
  );
  return [header, ...lines].join("\n");
}

function labelFulfillment(locale: Locale, v: string) {
  if (v === "dine_in") return locale === "zh" ? "堂食" : "Dine-in";
  if (v === "pickup") return locale === "zh" ? "自取" : "Pickup";
  if (v === "delivery") return locale === "zh" ? "外卖" : "Delivery";
  return v;
}

function labelPayment(locale: Locale, v: string) {
  if (v === "cash") return locale === "zh" ? "现金" : "Cash";
  if (v === "card") return locale === "zh" ? "信用卡/借记卡" : "Card";
  if (v === "online") return locale === "zh" ? "在线支付" : "Online";
  if (v === "unknown") return locale === "zh" ? "其他" : "Other";
  return v;
}

export default function PosDailySummaryPage() {
  const params = useParams<{ locale?: string }>();
  const locale: Locale = params?.locale === "zh" ? "zh" : "en";
  const copy = COPY[locale];

  const [filters] = useState<FilterState>({
    dateStart: "",
    dateEnd: "",
    channel: "",
    status: "",
    payment: "",
  });

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [data, setData] = useState<PosDailySummaryResponse | null>(null);

  const [storeTimezone, setStoreTimezone] = useState<string>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await apiFetch<BusinessConfigLite>("/admin/business/config").catch(() => null);
      if (cancelled) return;
      const tz =
        cfg?.timezone?.trim() ||
        (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
      setStoreTimezone(tz);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const ac = new AbortController();

    async function run() {
      setLoading(true);
      setErrorMsg(null);

      try {
        const { timeMin, timeMax } = buildUtcRange(
          filters.dateStart,
          filters.dateEnd,
          storeTimezone || "UTC",
        );
        const qs = new URLSearchParams({
          timeMin,
          timeMax,
          ...(filters.channel ? { fulfillmentType: filters.channel } : {}),
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.payment ? { payment: filters.payment } : {}),
        });

        const res = await apiFetch<PosDailySummaryResponse>(
          `/pos/summary?${qs.toString()}`,
          {
            signal: ac.signal,
          },
        );

        setData(res);
      } catch (e: unknown) {
        // AbortError 兼容：unknown 下要先做类型缩窄
        if (
          e &&
          typeof e === "object" &&
          "name" in e &&
          (e as { name?: unknown }).name === "AbortError"
        ) {
          return;
        }
        setErrorMsg(errMessage(e));
        setData(null);
      } finally {
        setLoading(false);
      }
    }

    run();
    return () => ac.abort();
  }, [filters.dateStart, filters.dateEnd, filters.channel, filters.status, filters.payment, storeTimezone]);

  const orders = useMemo<OrderRow[]>(() => {
    if (!data) return [];
    return data.orders.map((o) => ({
      orderStableId: o.orderStableId,
      clientRequestId: o.clientRequestId ?? "--",
      date: (() => {
        const d = parseBackendDate(o.createdAt);
        if (Number.isNaN(d.getTime())) return "--";
        return d.toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
          timeZone: storeTimezone || "UTC",
        });
      })(),
      channel: o.fulfillmentType,
      status: o.statusBucket,
      payment: o.payment,
      amountCents: o.netCents,
    }));
  }, [data, locale, storeTimezone]);

  const filteredOrders = orders;

  const summaryTotals = data?.totals ?? {
    orders: filteredOrders.length,
    salesCents: 0,
    taxCents: 0,
    discountCents: 0,
    refundCents: 0,
    netCents: filteredOrders.reduce((s, o) => s + o.amountCents, 0),
  };

  const paymentBreakdown = useMemo(() => {
    const base = [
      { key: "cash", label: labelPayment(locale, "cash"), count: 0, amountCents: 0 },
      { key: "card", label: labelPayment(locale, "card"), count: 0, amountCents: 0 },
      { key: "online", label: labelPayment(locale, "online"), count: 0, amountCents: 0 },
      { key: "unknown", label: labelPayment(locale, "unknown"), count: 0, amountCents: 0 },
    ];
    const map = new Map(base.map((x) => [x.key, x]));
    for (const item of data?.breakdownByPayment ?? []) {
      const hit = map.get(item.payment) ?? map.get("unknown")!;
      hit.count += item.count;
      hit.amountCents += item.amountCents;
    }
    return base;
  }, [data, locale]);

  const channelBreakdown = useMemo(() => {
    const base = [
      { key: "dine_in", label: labelFulfillment(locale, "dine_in"), count: 0, amountCents: 0 },
      { key: "pickup", label: labelFulfillment(locale, "pickup"), count: 0, amountCents: 0 },
      { key: "delivery", label: labelFulfillment(locale, "delivery"), count: 0, amountCents: 0 },
    ];
    const map = new Map(base.map((x) => [x.key, x]));
    for (const item of data?.breakdownByFulfillment ?? []) {
      const hit = map.get(item.fulfillmentType);
      if (!hit) continue;
      hit.count += item.count;
      hit.amountCents += item.amountCents;
    }
    return base;
  }, [data, locale]);

  return (
    <main className="min-h-screen bg-slate-900 text-slate-50">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700 px-6 py-4">
        <div>
          <h1 className="text-2xl font-semibold">{copy.title}</h1>
          <p className="text-sm text-slate-300">{copy.subtitle}</p>
          {loading ? (
            <p className="mt-1 text-xs text-slate-400">{copy.loading}</p>
          ) : errorMsg ? (
            <p className="mt-1 text-xs text-rose-300">{errorMsg}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/${locale}/store/pos`}
            className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-100 hover:border-slate-400 hover:text-white"
          >
            {copy.backToPos}
          </Link>
          <button
            type="button"
            onClick={() => {
              const csv = toCsv(filteredOrders);
              downloadCsv("pos-daily-summary.csv", csv);
            }}
            className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-100 hover:border-slate-400 hover:text-white"
          >
            {copy.exportCsv}
          </button>
        </div>
      </header>

      <section className="grid gap-4 px-6 py-4 lg:grid-cols-[2fr,1fr]">
        <div className="rounded-3xl border border-slate-700 bg-slate-800/60 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{copy.summary}</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-full border border-emerald-400/60 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200"
              >
                {copy.printSummary}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-full border border-slate-500/60 bg-slate-700/50 px-3 py-1 text-xs font-semibold text-slate-200"
              >
                {copy.printTransactions}
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              { label: copy.summaryCards.orders, value: String(summaryTotals.orders) },
              { label: copy.summaryCards.sales, value: formatMoney(summaryTotals.salesCents) },
              { label: copy.summaryCards.tax, value: formatMoney(summaryTotals.taxCents) },
              { label: copy.summaryCards.discount, value: formatMoney(summaryTotals.discountCents) },
              { label: copy.summaryCards.refund, value: formatMoney(summaryTotals.refundCents) },
              { label: copy.summaryCards.net, value: formatMoney(summaryTotals.netCents) },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-slate-700 bg-slate-900/70 p-3"
              >
                <div className="text-xs text-slate-400">{item.label}</div>
                <div className="mt-2 text-lg font-semibold">{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-3xl border border-slate-700 bg-slate-800/60 p-4">
            <h3 className="text-sm font-semibold text-slate-200">
              {copy.breakdownByPayment}
            </h3>
            <ul className="mt-3 space-y-2 text-sm">
              {paymentBreakdown.map((item) => (
                <li
                  key={item.key}
                  className="flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-900/60 px-3 py-2"
                >
                  <span className="text-slate-200">{item.label}</span>
                  <span className="text-slate-400">
                    {item.count} · {formatMoney(item.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-slate-700 bg-slate-800/60 p-4">
            <h3 className="text-sm font-semibold text-slate-200">
              {copy.breakdownByChannel}
            </h3>
            <ul className="mt-3 space-y-2 text-sm">
              {channelBreakdown.map((item) => (
                <li
                  key={item.key}
                  className="flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-900/60 px-3 py-2"
                >
                  <span className="text-slate-200">{item.label}</span>
                  <span className="text-slate-400">
                    {item.count} · {formatMoney(item.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
