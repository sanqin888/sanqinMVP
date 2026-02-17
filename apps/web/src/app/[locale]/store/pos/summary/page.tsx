"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Locale } from "@/lib/i18n/locales";
import { apiFetch } from "@/lib/api/client";
import { printSummaryCloud } from "@/lib/api/pos";
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
      sales: "销售额", // 注：现在后端返回的是不含税净销
      tax: "税",
      discount: "折扣",
      refund: "退款",
      total: "总额",
    },
    breakdownByPayment: "按支付方式汇总",
    breakdownByChannel: "按渠道汇总",
    printSummary: "打印汇总报表",
    printPreview: {
      title: "打印预览",
      subtitle: "请确认打印内容无误。",
      confirm: "确认打印",
      cancel: "返回修改",
    },
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
    printDialog: {
      title: "打印汇总报表",
      subtitle: "请选择打印维度（金额为实际收款金额，不含税）。",
      previewTitle: "打印预览",
      confirmPrint: "确认打印",
      back: "返回",
      cancel: "取消",
    },
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
      total: "Total",
    },
    breakdownByPayment: "By payment method",
    breakdownByChannel: "By channel",
    printSummary: "Print summary report",
    printPreview: {
      title: "Print preview",
      subtitle: "Please confirm the print details.",
      confirm: "Confirm print",
      cancel: "Back",
    },
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
    printDialog: {
      title: "Print Summary Report",
      subtitle: "Select summary type (Amounts are Net Sales excluding tax).",
      previewTitle: "Print Preview",
      confirmPrint: "Print Now",
      back: "Back",
      cancel: "Cancel",
    },
  },
} as const;

type FilterState = {
  dateStart: string; // YYYY-MM-DD
  dateEnd: string;   // YYYY-MM-DD
  channel: string;   // in_store|web|ubereats
  status: string;    // paid|refunded|void
  payment: string;   // cash|card|online|store_balance
};

type OrderRow = {
  orderStableId: string;
  date: string;
  channel: string; // channel
  status: string;  // statusBucket
  payment: string; // payment bucket
  amountCents: number; // total
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
    deliveryFeeCents: number;
    deliveryCostCents: number;
  };
  breakdownByPayment: Array<{
    payment: "cash" | "card" | "online" | "store_balance" | "ubereats";
    count: number;
    amountCents: number;
  }>;
  breakdownByFulfillment: Array<{
    fulfillmentType: "pickup" | "dine_in" | "delivery";
    count: number;
    amountCents: number;
  }>;
  breakdownByChannel: Array<{
    channel: "in_store" | "web" | "ubereats";
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

    payment: "cash" | "card" | "online" | "store_balance" | "ubereats";

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
  const guess0 = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
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
  const header = ["orderStableId", "clientRequestId", "time", "fulfillment", "status", "payment", "total"].join(",");
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

function labelChannel(locale: Locale, v: string) {
  if (v === "in_store") return locale === "zh" ? "门店" : "In-store";
  if (v === "web") return locale === "zh" ? "网站" : "Website";
  if (v === "ubereats") return "UberEats";
  return v;
}

function labelPayment(locale: Locale, v: string) {
  if (v === "cash") return locale === "zh" ? "现金" : "Cash";
  if (v === "card") return locale === "zh" ? "信用卡/借记卡" : "Card";
  if (v === "online") return locale === "zh" ? "在线支付" : "Online";
  if (v === "store_balance") return locale === "zh" ? "储值余额" : "Store balance";
  if (v === "ubereats") return "UberEats";
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
  
  // 弹窗控制
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  // 预览状态：null = 选择模式, 'payment'/'channel' = 预览模式
  const [previewType, setPreviewType] = useState<'payment' | 'channel' | null>(null);

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
      clientRequestId: o.clientRequestId ?? o.orderStableId,
      date: (() => {
        const d = parseBackendDate(o.createdAt);
        if (Number.isNaN(d.getTime())) return "--";
        return d.toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
          timeZone: storeTimezone || "UTC",
        });
      })(),
      channel: o.channel,
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
    deliveryFeeCents: 0,
    deliveryCostCents: 0,
  };

  const paymentBreakdown = useMemo(() => {
    const base = [
      { key: "cash", label: labelPayment(locale, "cash"), count: 0, amountCents: 0 },
      { key: "card", label: labelPayment(locale, "card"), count: 0, amountCents: 0 },
      { key: "online", label: labelPayment(locale, "online"), count: 0, amountCents: 0 },
      { key: "store_balance", label: labelPayment(locale, "store_balance"), count: 0, amountCents: 0 },
      { key: "ubereats", label: labelPayment(locale, "ubereats"), count: 0, amountCents: 0 },
    ];
    const map = new Map(base.map((x) => [x.key, x]));
    for (const item of data?.breakdownByPayment ?? []) {
      const hit = map.get(item.payment) ?? map.get("ubereats")!;
      hit.count += item.count;
      hit.amountCents += item.amountCents;
    }
    return base;
  }, [data, locale]);

  const channelBreakdown = useMemo(() => {
    const base = [
      { key: "in_store", label: labelChannel(locale, "in_store"), count: 0, amountCents: 0 },
      { key: "web", label: labelChannel(locale, "web"), count: 0, amountCents: 0 },
      { key: "ubereats", label: labelChannel(locale, "ubereats"), count: 0, amountCents: 0 },
    ];
    const map = new Map(base.map((x) => [x.key, x]));
    for (const item of data?.breakdownByChannel ?? []) {
      const hit = map.get(item.channel);
      if (!hit) continue;
      hit.count += item.count;
      hit.amountCents += item.amountCents;
    }
    return base;
  }, [data, locale]);

  // 打开弹窗（重置状态）
  const openPrintDialog = () => {
    setPreviewType(null);
    setIsPrintDialogOpen(true);
  };

// ✅ 获取格式化日期字符串 (YYYY/MM/DD)
  const getFormattedDateStr = () => {
    if (!data) return "";
    try {
        // 使用 en-CA locale 可以直接获得 YYYY-MM-DD 格式，然后把 - 换成 /
        const dtf = new Intl.DateTimeFormat('en-CA', { 
            timeZone: storeTimezone,
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
        return dtf.format(new Date(data.timeMin)).replace(/-/g, '/');
    } catch {
        return data.timeMin.substring(0, 10); // fallback
    }
  };

  // ✅ 执行真实打印
  const handleConfirmPrint = async () => {
    if (!data || !previewType) return;


    try {
      setLoading(true);
      const params: Record<string, string> = {
        timeMin: data.timeMin,
        timeMax: data.timeMax,
        breakdownType: previewType,
      };

      if (filters.channel) params.fulfillmentType = filters.channel;
      if (filters.status) params.status = filters.status;
      if (filters.payment) params.payment = filters.payment;

      await printSummaryCloud(params);
      setIsPrintDialogOpen(false);
    } catch (err) {
      console.error("Failed to print summary via cloud:", err);
      alert("打印失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  // ✅ 渲染预览卡片内容
  const renderPreviewContent = () => {
    if (!data || !previewType) return null;
    
    const dateStr = getFormattedDateStr(); // 获取日期
    
    const items = previewType === 'payment' ? paymentBreakdown : channelBreakdown;
    
    return (
      <div className="mx-auto mt-2 w-full max-w-[300px] bg-white p-4 text-xs font-mono text-black shadow-inner">
        {/* 模拟小票样式 */}
        <div className="text-center font-bold text-lg mb-1">当日小结</div>
        <div className="text-center mb-2">Daily Summary</div>
        <div className="border-b border-dashed border-black my-2"></div>
        
        {/* 修改为单行日期显示 */}
        <div>日期: {dateStr}</div>
        
        <div className="border-b border-dashed border-black my-2"></div>
        
        <div className="font-bold mb-1">
          {previewType === 'payment' ? '按支付方式 (By Payment)' : '按渠道 (By Channel)'}
        </div>
        <div className="flex justify-between mb-1 text-[10px] opacity-70">
           <span>类别</span>
           <span>单数 / 金额(不含税)</span>
        </div>
        {items.map((item) => (
          <div key={item.key} className="flex justify-between mb-1">
            <span>{item.label}</span>
            <div className="text-right">
              <span className="mr-2">{item.count}</span>
              <span>{formatMoney(item.amountCents)}</span>
            </div>
          </div>
        ))}
        <div className="border-b border-dashed border-black my-2"></div>

        <div className="font-bold mb-1">今日总计 (Totals)</div>
        <div className="flex justify-between">
          <span>总单量 Orders</span>
          <span>{data.totals.orders}</span>
        </div>
        <div className="flex justify-between">
          <span>销售额 Sales</span>
          <span>{formatMoney(data.totals.salesCents)}</span>
        </div>
        <div className="flex justify-between">
          <span>优惠金额 Discount</span>
          <span>{formatMoney(data.totals.discountCents)}</span>
        </div>
        <div className="border-b border-dashed border-black my-1 opacity-50"></div>
        <div className="flex justify-between">
          <span>合计税费 Tax</span>
          <span>{formatMoney(data.totals.taxCents)}</span>
        </div>
        <div className="flex justify-between">
          <span>合计配送费 D.Fee</span>
          <span>{formatMoney(data.totals.deliveryFeeCents)}</span>
        </div>
        <div className="flex justify-between">
          <span>合计Uber Cost</span>
          <span>{formatMoney(data.totals.deliveryCostCents)}</span>
        </div>
        <div className="border-b border-double border-black my-2"></div>
        <div className="flex justify-between font-bold text-sm">
          <span>总营业额 Total</span>
          <span>{formatMoney(data.totals.netCents)}</span>
        </div>
        
        <div className="mt-4 text-center opacity-50 text-[10px]">
          *** PREVIEW ***
        </div>
      </div>
    );
  };

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
                onClick={openPrintDialog}
                className="rounded-full border border-emerald-400/60 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20"
              >
                {copy.printSummary}
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
              { label: copy.summaryCards.total, value: formatMoney(summaryTotals.netCents) },
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

      {/* 打印选择 + 预览 弹窗 */}
      {isPrintDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-sm rounded-3xl border border-slate-600 bg-slate-900 p-6 shadow-2xl my-4">
            
            {!previewType ? (
              // 步骤1: 选择模式
              <>
                <h3 className="text-lg font-semibold text-slate-100 mb-2">
                  {copy.printDialog.title}
                </h3>
                <p className="text-sm text-slate-400 mb-6">
                  {copy.printDialog.subtitle}
                </p>
                
                <div className="space-y-3">
                  <button
                    onClick={() => setPreviewType('payment')}
                    className="flex w-full items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-100 hover:bg-emerald-500/20"
                  >
                    <span>{copy.breakdownByPayment}</span>
                    <span className="text-xs opacity-60">→</span>
                  </button>
                  
                  <button
                    onClick={() => setPreviewType('channel')}
                    className="flex w-full items-center justify-between rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-sm font-medium text-indigo-100 hover:bg-indigo-500/20"
                  >
                    <span>{copy.breakdownByChannel}</span>
                    <span className="text-xs opacity-60">→</span>
                  </button>
                </div>

                <button
                  onClick={() => setIsPrintDialogOpen(false)}
                  className="mt-6 w-full rounded-full border border-slate-700 bg-slate-800 py-2.5 text-sm text-slate-300 hover:bg-slate-700"
                >
                  {copy.printDialog.cancel}
                </button>
              </>
            ) : (
              // 步骤2: 预览模式
              <>
                 <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-slate-100">
                      {copy.printDialog.previewTitle}
                    </h3>
                    <button 
                      onClick={() => setPreviewType(null)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      {copy.printDialog.back}
                    </button>
                 </div>
                 
                 {/* 预览区域 */}
                 <div className="bg-slate-800/50 p-2 rounded-xl mb-4 max-h-[60vh] overflow-y-auto">
                   {renderPreviewContent()}
                 </div>

                 <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setPreviewType(null)}
                      className="w-full rounded-full border border-slate-700 bg-slate-800 py-2.5 text-sm text-slate-300 hover:bg-slate-700"
                    >
                      {copy.printDialog.back}
                    </button>
                    <button
                      onClick={handleConfirmPrint}
                      className="w-full rounded-full bg-emerald-500 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600"
                    >
                      {copy.printDialog.confirmPrint}
                    </button>
                 </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
