// apps/web/src/app/[locale]/store/pos/orders/page.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Locale } from "@/lib/order/shared";

const COPY = {
  zh: {
    title: "订单管理",
    subtitle: "全量查询与复杂筛选，用于门店订单追踪。",
    backToPos: "返回 POS 点单",
    filtersTitle: "筛选条件",
    filtersSubtitle: "支持时间、渠道、状态、支付方式、金额区间等组合筛选。",
    filterTags: [
      "今日订单",
      "外卖",
      "堂食",
      "待支付",
      "已完成",
      "退款中",
      "高客单",
    ],
    tableTitle: "订单列表",
    tableSubtitle: "点击订单可查看可操作功能。",
    orderNumber: "订单号",
    orderType: "类型",
    orderStatus: "状态",
    orderAmount: "金额",
    orderTime: "时间",
    paymentMethodLabel: "支付方式",
    orderCard: {
      pickup: "堂食",
      delivery: "外卖",
      takeout: "自取",
    },
    paymentMethod: {
      cash: "现金",
      card: "银行卡",
    },
    status: {
      paid: "已支付",
      pending: "待支付",
      completed: "已完成",
      refunding: "退款中",
    },
    actionsTitle: "订单操作",
    actionsSubtitle: "选中订单后进行处理。",
    emptySelection: "请选择左侧订单查看功能。",
    actionLabels: {
      retender: "更改支付方式（Re-tender）",
      void_item: "退菜 = 部分退款 / 作废单品（Void Item）",
      swap_item: "换菜 = 退旧 + 加新 + 差额补收/差额退款",
    },
    reasonLabel: "操作原因",
    reasonPlaceholder: "请输入原因（必填）",
    deltaLabel: "金额变化",
    deltaOptions: {
      increase: "金额增加",
      same: "等价更换",
      decrease: "金额减少",
    },
    cashGuideTitle: "现金处理逻辑",
    cashGuide: {
      retender: ["直接退款原现金付款，再用新方式收款。"],
      void_item: ["可做部分退款，并记录原因。"],
      swap_item: ["按差额补收或部分退款。"],
    },
    cardGuideTitle: "银行卡处理逻辑",
    cardGuide: {
      retender: [
        "设备不支持部分退款，需对原交易做整单 void/refund。",
        "使用新方式对刷“新金额”，并用 rebillGroupId 关联。",
      ],
      void_item: [
        "delta > 0：刷差额销售，系统记录 AdditionalCharge。",
        "delta = 0：只改明细，厨房打印作废联/更改单 + 加菜联。",
        "delta < 0：整单退款再对刷“新金额”，rebillGroupId 串联。",
      ],
      swap_item: [
        "delta > 0：刷差额销售，系统记录 AdditionalCharge。",
        "delta = 0：只改明细，厨房打印作废联/更改单 + 加菜联。",
        "delta < 0：整单退款再对刷“新金额”，rebillGroupId 串联。",
      ],
    },
    summaryTitle: "订单小结",
    summaryOriginal: "原订单金额",
    summaryRefund: "退款金额",
    summaryAdditionalCharge: "差额补收",
    summaryNewCharge: "新收款",
    summaryNewTotal: "新订单金额",
    summaryNoChange: "无需退款或补收",
    rebillGroupLabel: "Rebill 关联号",
    footerTip: "支持一键复核订单与差额结算。",
  },
  en: {
    title: "Order Management",
    subtitle: "Full query & advanced filters for store order tracking.",
    backToPos: "Back to POS",
    filtersTitle: "Filters",
    filtersSubtitle:
      "Combine time, channel, status, payment method, and amount range.",
    filterTags: [
      "Today",
      "Delivery",
      "Dine-in",
      "Pending",
      "Completed",
      "Refunding",
      "High ticket",
    ],
    tableTitle: "Orders",
    tableSubtitle: "Select an order to see actions.",
    orderNumber: "Order #",
    orderType: "Type",
    orderStatus: "Status",
    orderAmount: "Amount",
    orderTime: "Time",
    paymentMethodLabel: "Payment",
    orderCard: {
      pickup: "Dine-in",
      delivery: "Delivery",
      takeout: "Pickup",
    },
    paymentMethod: {
      cash: "Cash",
      card: "Card",
    },
    status: {
      paid: "Paid",
      pending: "Pending",
      completed: "Completed",
      refunding: "Refunding",
    },
    actionsTitle: "Order actions",
    actionsSubtitle: "Operate after selecting an order.",
    emptySelection: "Select an order to view actions.",
    actionLabels: {
      retender: "Re-tender payment method",
      void_item: "Void item = partial refund / cancel item",
      swap_item: "Swap item = return old + add new + settle difference",
    },
    reasonLabel: "Reason",
    reasonPlaceholder: "Enter reason (required)",
    deltaLabel: "Amount change",
    deltaOptions: {
      increase: "Increase",
      same: "No change",
      decrease: "Decrease",
    },
    cashGuideTitle: "Cash handling",
    cashGuide: {
      retender: ["Refund the original cash payment, then take new payment."],
      void_item: ["Allow partial refunds and record the reason."],
      swap_item: ["Settle the difference with refund or extra charge."],
    },
    cardGuideTitle: "Card handling",
    cardGuide: {
      retender: [
        "Partial refunds are not supported; void/refund the original sale.",
        "Charge the new amount and link with a rebillGroupId.",
      ],
      void_item: [
        "delta > 0: charge the difference, record as AdditionalCharge.",
        "delta = 0: update items only, print void/change + add tickets.",
        "delta < 0: void/refund then rebill the new amount (rebillGroupId).",
      ],
      swap_item: [
        "delta > 0: charge the difference, record as AdditionalCharge.",
        "delta = 0: update items only, print void/change + add tickets.",
        "delta < 0: void/refund then rebill the new amount (rebillGroupId).",
      ],
    },
    summaryTitle: "Order summary",
    summaryOriginal: "Original total",
    summaryRefund: "Refund amount",
    summaryAdditionalCharge: "Additional charge",
    summaryNewCharge: "New charge",
    summaryNewTotal: "New total",
    summaryNoChange: "No refund or charge needed",
    rebillGroupLabel: "Rebill group",
    footerTip: "Support quick reconciliation and difference settlement.",
  },
} as const;

type OrderStatusKey = keyof (typeof COPY)["zh"]["status"];
type ActionKey = keyof (typeof COPY)["zh"]["actionLabels"];
type PaymentMethodKey = keyof (typeof COPY)["zh"]["paymentMethod"];
type DeltaMode = keyof (typeof COPY)["zh"]["deltaOptions"];

const ACTIONS: ActionKey[] = ["retender", "void_item", "swap_item"];

type OrderRecord = {
  id: string;
  type: keyof (typeof COPY)["zh"]["orderCard"];
  status: OrderStatusKey;
  amountCents: number;
  time: string;
  channel: string;
  paymentMethod: PaymentMethodKey;
};

const SAMPLE_ORDERS: OrderRecord[] = [
  {
    id: "c9xk3l3b1y8k42uv2e00p9d1",
    type: "pickup",
    status: "paid",
    amountCents: 8240,
    time: "10:32",
    channel: "POS",
    paymentMethod: "cash",
  },
  {
    id: "c9xk3l3b1y8k42uv2e00p9d2",
    type: "delivery",
    status: "pending",
    amountCents: 4500,
    time: "11:05",
    channel: "Delivery",
    paymentMethod: "card",
  },
  {
    id: "c9xk3l3b1y8k42uv2e00p9d3",
    type: "takeout",
    status: "completed",
    amountCents: 2960,
    time: "12:18",
    channel: "Online",
    paymentMethod: "card",
  },
  {
    id: "c9xk3l3b1y8k42uv2e00p9d4",
    type: "pickup",
    status: "refunding",
    amountCents: 6420,
    time: "12:45",
    channel: "POS",
    paymentMethod: "cash",
  },
  {
    id: "c9xk3l3b1y8k42uv2e00p9d5",
    type: "delivery",
    status: "paid",
    amountCents: 11890,
    time: "13:12",
    channel: "Delivery",
    paymentMethod: "card",
  },
];

function statusTone(status: OrderStatusKey): string {
  switch (status) {
    case "paid":
      return "bg-emerald-500/15 text-emerald-100 border-emerald-400/40";
    case "pending":
      return "bg-amber-500/15 text-amber-100 border-amber-400/40";
    case "completed":
      return "bg-sky-500/15 text-sky-100 border-sky-400/40";
    case "refunding":
      return "bg-rose-500/15 text-rose-100 border-rose-400/40";
    default:
      return "bg-slate-700 text-slate-200 border-slate-500";
  }
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

type ActionSummary = {
  baseTotal: number;
  refundCents: number;
  additionalChargeCents: number;
  newChargeCents: number;
  newTotalCents: number;
  rebillGroupId: string | null;
};

type ActionContentProps = {
  copy: (typeof COPY)[keyof typeof COPY];
  order: OrderRecord;
  selectedAction: ActionKey | null;
  onSelectAction: (action: ActionKey) => void;
  deltaMode: DeltaMode;
  onDeltaChange: (mode: DeltaMode) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  summary: ActionSummary | null;
};

function ActionContent({
  copy,
  order,
  selectedAction,
  onSelectAction,
  deltaMode,
  onDeltaChange,
  reason,
  onReasonChange,
  summary,
}: ActionContentProps) {
  const guide =
    order.paymentMethod === "cash"
      ? copy.cashGuide[selectedAction ?? "retender"]
      : copy.cardGuide[selectedAction ?? "retender"];

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold">{order.id}</div>
        <div className="mt-1 text-[11px] text-slate-300">
          {copy.orderCard[order.type]} · {copy.paymentMethod[order.paymentMethod]} ·{" "}
          {copy.status[order.status]}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((actionKey) => (
          <button
            key={actionKey}
            type="button"
            onClick={() => onSelectAction(actionKey)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              selectedAction === actionKey
                ? "border-emerald-400/70 bg-emerald-500/15 text-emerald-50"
                : "border-slate-700 bg-slate-900/40 text-slate-200"
            }`}
          >
            {copy.actionLabels[actionKey]}
          </button>
        ))}
      </div>

      {selectedAction && (
        <>
          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-200">
            <div className="text-[11px] font-semibold uppercase text-slate-400">
              {order.paymentMethod === "cash"
                ? copy.cashGuideTitle
                : copy.cardGuideTitle}
            </div>
            <ul className="mt-2 space-y-1">
              {guide.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-200">
            <div className="text-[11px] font-semibold uppercase text-slate-400">
              {copy.deltaLabel}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(copy.deltaOptions) as DeltaMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onDeltaChange(mode)}
                  className={`rounded-full border px-3 py-1 text-[11px] ${
                    deltaMode === mode
                      ? "border-sky-400/70 bg-sky-500/15 text-sky-50"
                      : "border-slate-700 bg-slate-800/50 text-slate-200"
                  }`}
                >
                  {copy.deltaOptions[mode]}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-200">
            <label className="text-[11px] font-semibold uppercase text-slate-400">
              {copy.reasonLabel}
            </label>
            <textarea
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder={copy.reasonPlaceholder}
              className="mt-2 min-h-[72px] w-full resize-none rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 focus:border-emerald-400 focus:outline-none"
            />
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-200">
            <div className="text-[11px] font-semibold uppercase text-slate-400">
              {copy.summaryTitle}
            </div>
            {summary ? (
              <div className="mt-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span>{copy.summaryOriginal}</span>
                  <span className="font-semibold">
                    {formatMoney(summary.baseTotal)}
                  </span>
                </div>
                {summary.refundCents > 0 && (
                  <div className="flex items-center justify-between text-rose-200">
                    <span>{copy.summaryRefund}</span>
                    <span className="font-semibold">
                      -{formatMoney(summary.refundCents)}
                    </span>
                  </div>
                )}
                {summary.additionalChargeCents > 0 && (
                  <div className="flex items-center justify-between text-amber-200">
                    <span>{copy.summaryAdditionalCharge}</span>
                    <span className="font-semibold">
                      +{formatMoney(summary.additionalChargeCents)}
                    </span>
                  </div>
                )}
                {summary.newChargeCents > 0 && (
                  <div className="flex items-center justify-between text-emerald-200">
                    <span>{copy.summaryNewCharge}</span>
                    <span className="font-semibold">
                      {formatMoney(summary.newChargeCents)}
                    </span>
                  </div>
                )}
                {summary.refundCents === 0 &&
                  summary.additionalChargeCents === 0 &&
                  summary.newChargeCents === 0 && (
                    <div className="text-slate-400">
                      {copy.summaryNoChange}
                    </div>
                  )}
                <div className="flex items-center justify-between border-t border-slate-700 pt-2 text-slate-100">
                  <span>{copy.summaryNewTotal}</span>
                  <span className="font-semibold">
                    {formatMoney(summary.newTotalCents)}
                  </span>
                </div>
                {summary.rebillGroupId && (
                  <div className="flex items-center justify-between text-slate-400">
                    <span>{copy.rebillGroupLabel}</span>
                    <span>{summary.rebillGroupId}</span>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

export default function PosOrdersPage() {
  const params = useParams<{ locale?: string }>();
  const locale = (params?.locale === "zh" ? "zh" : "en") as Locale;
  const copy = COPY[locale];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<ActionKey | null>(null);
  const [deltaMode, setDeltaMode] = useState<DeltaMode>("same");
  const [reason, setReason] = useState("");

  const selectedOrder = useMemo(
    () => SAMPLE_ORDERS.find((order) => order.id === selectedId) ?? null,
    [selectedId],
  );

  const summary = useMemo(() => {
    if (!selectedOrder || !selectedAction) return null;
    const baseTotal = selectedOrder.amountCents;
    const deltaMagnitude = Math.max(200, Math.round(baseTotal * 0.12));
    const deltaCents =
      deltaMode === "increase"
        ? deltaMagnitude
        : deltaMode === "decrease"
          ? -deltaMagnitude
          : 0;

    const paymentMethod = selectedOrder.paymentMethod;
    const isRetender = selectedAction === "retender";

    if (paymentMethod === "cash") {
      if (isRetender) {
        return {
          baseTotal,
          refundCents: baseTotal,
          newChargeCents: baseTotal + deltaCents,
          additionalChargeCents: 0,
          newTotalCents: baseTotal + deltaCents,
          rebillGroupId: null,
        };
      }

      const refundCents = deltaCents < 0 ? Math.abs(deltaCents) : 0;
      const additionalChargeCents = deltaCents > 0 ? deltaCents : 0;
      return {
        baseTotal,
        refundCents,
        newChargeCents: 0,
        additionalChargeCents,
        newTotalCents: baseTotal + deltaCents,
        rebillGroupId: null,
      };
    }

    if (isRetender) {
      return {
        baseTotal,
        refundCents: baseTotal,
        newChargeCents: baseTotal + deltaCents,
        additionalChargeCents: 0,
        newTotalCents: baseTotal + deltaCents,
        rebillGroupId: "RB-20240918-01",
      };
    }

    if (deltaCents > 0) {
      return {
        baseTotal,
        refundCents: 0,
        newChargeCents: 0,
        additionalChargeCents: deltaCents,
        newTotalCents: baseTotal + deltaCents,
        rebillGroupId: null,
      };
    }

    if (deltaCents === 0) {
      return {
        baseTotal,
        refundCents: 0,
        newChargeCents: 0,
        additionalChargeCents: 0,
        newTotalCents: baseTotal,
        rebillGroupId: null,
      };
    }

    return {
      baseTotal,
      refundCents: baseTotal,
      newChargeCents: baseTotal + deltaCents,
      additionalChargeCents: 0,
      newTotalCents: baseTotal + deltaCents,
      rebillGroupId: "RB-20240918-02",
    };
  }, [deltaMode, selectedAction, selectedOrder]);

  return (
    <main className="min-h-screen bg-slate-900 text-slate-50">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-700 px-6 py-4">
        <div>
          <h1 className="text-2xl font-semibold">{copy.title}</h1>
          <p className="text-sm text-slate-300">{copy.subtitle}</p>
        </div>
        <Link
          href={`/${locale}/store/pos`}
          className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-100 hover:border-slate-400 hover:text-white"
        >
          {copy.backToPos}
        </Link>
      </header>

      <section className="grid gap-4 px-6 py-4 lg:grid-cols-[1.05fr_1.6fr_1.1fr]">
        <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{copy.filtersTitle}</h2>
              <p className="text-xs text-slate-300">{copy.filtersSubtitle}</p>
            </div>
            <span className="rounded-full border border-slate-600 bg-slate-800 px-2.5 py-1 text-[11px] text-slate-200">
              6/12
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {copy.filterTags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-slate-600 bg-slate-900/40 px-3 py-1 text-xs text-slate-200"
              >
                {tag}
              </span>
            ))}
          </div>
          <div className="mt-4 grid gap-3 text-xs text-slate-300">
            <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3">
              <div className="text-[11px] uppercase text-slate-400">Channels</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {["POS", "Online", "Delivery", "Membership"].map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px]"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3">
              <div className="text-[11px] uppercase text-slate-400">Amount</div>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-300">
                <span className="rounded-full border border-slate-700 px-2 py-1">
                  $0
                </span>
                <span className="text-slate-500">~</span>
                <span className="rounded-full border border-slate-700 px-2 py-1">
                  $200+
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-4">
          <div className="mb-3">
            <h2 className="text-lg font-semibold">{copy.tableTitle}</h2>
            <p className="text-xs text-slate-300">{copy.tableSubtitle}</p>
          </div>
          <div className="space-y-3">
            {SAMPLE_ORDERS.map((order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => {
                  setSelectedId(order.id);
                  setSelectedAction("retender");
                  setDeltaMode("same");
                  setReason("");
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition hover:border-slate-400 hover:bg-slate-800/70 ${
                  order.id === selectedId
                    ? "border-emerald-400/70 bg-emerald-500/10"
                    : "border-slate-700 bg-slate-900/40"
                }`}
              >
                <div>
                  <div className="text-sm font-semibold">{order.id}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                    <span className="rounded-full border border-slate-600 px-2 py-0.5">
                      {copy.orderCard[order.type]}
                    </span>
                    <span className="rounded-full border border-slate-700 px-2 py-0.5">
                      {order.channel}
                    </span>
                    <span className="rounded-full border border-slate-700 px-2 py-0.5">
                      {copy.paymentMethod[order.paymentMethod]}
                    </span>
                    <span>{order.time}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">
                    {formatMoney(order.amountCents)}
                  </div>
                  <div
                    className={`mt-1 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] ${statusTone(
                      order.status,
                    )}`}
                  >
                    {copy.status[order.status]}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4">
          <div>
            <h2 className="text-lg font-semibold">{copy.actionsTitle}</h2>
            <p className="text-xs text-slate-300">{copy.actionsSubtitle}</p>
          </div>
          <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-900/50 p-4">
            {selectedOrder ? (
              <ActionContent
                copy={copy}
                order={selectedOrder}
                selectedAction={selectedAction}
                onSelectAction={setSelectedAction}
                deltaMode={deltaMode}
                onDeltaChange={setDeltaMode}
                reason={reason}
                onReasonChange={setReason}
                summary={summary}
              />
            ) : (
              <p className="text-sm text-slate-300">{copy.emptySelection}</p>
            )}
          </div>
          <p className="mt-4 text-xs text-slate-400">{copy.footerTip}</p>
        </div>
      </section>

      {selectedOrder && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-slate-900/70 p-6 lg:items-center">
          <div className="w-full max-w-lg rounded-3xl border border-slate-600 bg-slate-900/95 p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">{copy.actionsTitle}</h3>
                <p className="text-xs text-slate-300">{selectedOrder.id}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(null);
                  setSelectedAction(null);
                  setDeltaMode("same");
                  setReason("");
                }}
                className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-slate-400"
              >
                ✕
              </button>
            </div>
            <div className="mt-4">
              <ActionContent
                copy={copy}
                order={selectedOrder}
                selectedAction={selectedAction}
                onSelectAction={setSelectedAction}
                deltaMode={deltaMode}
                onDeltaChange={setDeltaMode}
                reason={reason}
                onReasonChange={setReason}
                summary={summary}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-400">
              <span className="rounded-full border border-slate-700 px-2 py-1">
                {copy.orderCard[selectedOrder.type]}
              </span>
              <span className="rounded-full border border-slate-700 px-2 py-1">
                {copy.status[selectedOrder.status]}
              </span>
              <span className="rounded-full border border-slate-700 px-2 py-1">
                {copy.paymentMethod[selectedOrder.paymentMethod]}
              </span>
              <span className="rounded-full border border-slate-700 px-2 py-1">
                {formatMoney(selectedOrder.amountCents)}
              </span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
