// apps/web/src/app/[locale]/store/pos/orders/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Locale } from "@/lib/order/shared";
import { advanceOrder, apiFetch, updateOrderStatus } from "@/lib/api-client";

const COPY = {
  zh: {
    title: "订单管理",
    subtitle: "全量查询与复杂筛选，用于门店订单追踪。",
    backToPos: "返回 POS 点单",
    filtersTitle: "筛选条件",
    filtersSubtitle: "支持时间、渠道、状态、支付方式、金额区间等组合筛选。",
    tableTitle: "订单列表",
    tableSubtitle: "点击订单可查看可操作功能。",
    orderNumber: "订单号",
    orderType: "类型",
    orderStatus: "状态",
    orderAmount: "金额",
    orderTime: "时间",
    paymentMethodLabel: "支付方式",
    orderCard: {
      pickup: "自取",
      delivery: "外卖",
      dine_in: "堂食",
      takeout: "外带",
    },
    paymentMethod: {
      cash: "现金",
      card: "银行卡",
    },
    status: {
      paid: "已支付",
      pending: "待支付",
      making: "制作中",
      ready: "待取餐",
      completed: "已完成",
      refunded: "已退款",
    },
    actionsTitle: "订单操作",
    actionsSubtitle: "选中订单后进行处理。",
    emptySelection: "请选择左侧订单查看功能。",
    pickupCodeLabel: "取餐码",
    stableIdLabel: "Stable ID",
    orderMetaTitle: "订单信息",
    actionLabels: {
      retender: "更改支付方式（Re-tender）",
      void_item: "退菜 = 部分退款 / 作废单品（Void Item）",
      swap_item: "换菜 = 退旧 + 加新 + 差额补收/差额退款",
      full_refund: "全单退款",
    },
    actionNotice: "请选择需要处理的订单操作。",
    actionExecute: "执行操作",
    actionProcessing: "处理中...",
    actionSuccess: "已提交订单操作。",
    advanceStatus: "推进状态",
    advanceProcessing: "推进中...",
    advanceSuccess: "订单状态已推进。",
    advanceFailed: "推进失败，请稍后重试。",
    refundFailed: "退款失败，请稍后重试。",
    reasonLabel: "操作原因",
    reasonPlaceholder: "请输入原因（必填）",
    reasonPresets: ["顾客取消", "商品售罄", "操作失误", "支付方式调整"],
    itemSelectTitle: "选择退/换菜品",
    itemSelectHint: "退菜/换菜必须勾选对应菜品。",
    replacementLabel: "新菜品金额",
    replacementPlaceholder: "输入新菜品总价（可选）",
    channelLabel: {
      web: "线上",
      in_store: "POS",
      ubereats: "外卖平台",
    },
    cashGuideTitle: "现金处理逻辑",
    cashGuide: {
      retender: ["直接退款原现金付款，再用新方式收款。"],
      void_item: ["可做部分退款，并记录原因。"],
      swap_item: ["按差额补收或部分退款。"],
      full_refund: ["整单退款并作废原订单。"],
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
      full_refund: ["整单退款并作废原交易。"],
    },
    summaryTitle: "订单小结",
    summaryOriginal: "原订单金额",
    summarySubtotal: "小计",
    summaryDiscount: "优惠/积分抵扣",
    summaryTax: "税费",
    summaryDelivery: "配送费",
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
    tableTitle: "Orders",
    tableSubtitle: "Select an order to see actions.",
    orderNumber: "Order #",
    orderType: "Type",
    orderStatus: "Status",
    orderAmount: "Amount",
    orderTime: "Time",
    paymentMethodLabel: "Payment",
    orderCard: {
      pickup: "Pickup",
      delivery: "Delivery",
      dine_in: "Dine-in",
      takeout: "Takeout",
    },
    paymentMethod: {
      cash: "Cash",
      card: "Card",
    },
    status: {
      paid: "Paid",
      pending: "Pending",
      making: "In progress",
      ready: "Ready",
      completed: "Completed",
      refunded: "Refunded",
    },
    actionsTitle: "Order actions",
    actionsSubtitle: "Operate after selecting an order.",
    emptySelection: "Select an order to view actions.",
    pickupCodeLabel: "Pickup code",
    stableIdLabel: "Stable ID",
    orderMetaTitle: "Order info",
    actionLabels: {
      retender: "Re-tender payment method",
      void_item: "Void item = partial refund / cancel item",
      swap_item: "Swap item = return old + add new + settle difference",
      full_refund: "Full refund",
    },
    actionNotice: "Select an action to continue.",
    actionExecute: "Execute action",
    actionProcessing: "Processing...",
    actionSuccess: "Order action submitted.",
    advanceStatus: "Advance status",
    advanceProcessing: "Advancing...",
    advanceSuccess: "Order status advanced.",
    advanceFailed: "Failed to advance status. Please retry.",
    refundFailed: "Refund failed. Please retry.",
    reasonLabel: "Reason",
    reasonPlaceholder: "Enter reason (required)",
    reasonPresets: [
      "Customer cancellation",
      "Item out of stock",
      "Operator mistake",
      "Payment adjustment",
    ],
    itemSelectTitle: "Select items to void/swap",
    itemSelectHint: "Void/swap requires selecting the items to change.",
    replacementLabel: "Replacement total",
    replacementPlaceholder: "Enter replacement items total (optional)",
    channelLabel: {
      web: "Online",
      in_store: "POS",
      ubereats: "Delivery",
    },
    cashGuideTitle: "Cash handling",
    cashGuide: {
      retender: ["Refund the original cash payment, then take new payment."],
      void_item: ["Allow partial refunds and record the reason."],
      swap_item: ["Settle the difference with refund or extra charge."],
      full_refund: ["Refund the entire order and void the receipt."],
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
      full_refund: ["Void/refund the full transaction."],
    },
    summaryTitle: "Order summary",
    summaryOriginal: "Original total",
    summarySubtotal: "Subtotal",
    summaryDiscount: "Discounts/points",
    summaryTax: "Tax",
    summaryDelivery: "Delivery fee",
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

const ACTIONS: ActionKey[] = [
  "retender",
  "void_item",
  "swap_item",
  "full_refund",
];

const QUICK_FILTERS = [
  {
    key: "today",
    label: { zh: "今日订单", en: "Today" },
    type: "time",
    value: "today",
  },
  {
    key: "delivery",
    label: { zh: "外卖", en: "Delivery" },
    type: "fulfillment",
    value: "delivery",
  },
  {
    key: "dine_in",
    label: { zh: "堂食", en: "Dine-in" },
    type: "fulfillment",
    value: "dine_in",
  },
  {
    key: "pending",
    label: { zh: "待支付", en: "Pending" },
    type: "status",
    value: "pending",
  },
  {
    key: "completed",
    label: { zh: "已完成", en: "Completed" },
    type: "status",
    value: "completed",
  },
  {
    key: "refunded",
    label: { zh: "已退款", en: "Refunded" },
    type: "status",
    value: "refunded",
  },
  {
    key: "high_ticket",
    label: { zh: "高客单", en: "High ticket" },
    type: "amount",
    value: 8000,
  },
] as const;

type BackendOrder = {
  id: string;
  orderStableId?: string | null;
  pickupCode?: string | null;
  channel: "web" | "in_store" | "ubereats";
  fulfillmentType: "pickup" | "dine_in" | "delivery";
  status:
    | "pending"
    | "paid"
    | "making"
    | "ready"
    | "completed"
    | "refunded";
  subtotalCents?: number | null;
  subtotalAfterDiscountCents?: number | null;
  couponDiscountCents?: number | null;
  loyaltyRedeemCents?: number | null;
  taxCents?: number | null;
  deliveryFeeCents?: number | null;
  totalCents: number;
  createdAt: string;
  items: BackendOrderItem[];
};

type BackendOrderItem = {
  id: string;
  productStableId: string;
  qty: number;
  displayName?: string | null;
  nameEn?: string | null;
  nameZh?: string | null;
  unitPriceCents?: number | null;
};

type OrderRecord = {
  id: string;
  stableId: string;
  pickupCode: string | null;
  type: keyof (typeof COPY)["zh"]["orderCard"];
  status: OrderStatusKey;
  amountCents: number;
  subtotalCents: number;
  discountCents: number;
  subtotalAfterDiscountCents: number;
  taxCents: number;
  deliveryFeeCents: number;
  items: OrderItemRecord[];
  time: string;
  channel: BackendOrder["channel"];
  paymentMethod: PaymentMethodKey;
  createdAt: string;
};

type OrderItemRecord = {
  id: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  totalCents: number;
};

function statusTone(status: OrderStatusKey): string {
  switch (status) {
    case "paid":
      return "bg-emerald-500/15 text-emerald-100 border-emerald-400/40";
    case "pending":
      return "bg-amber-500/15 text-amber-100 border-amber-400/40";
    case "making":
      return "bg-indigo-500/15 text-indigo-100 border-indigo-400/40";
    case "ready":
      return "bg-sky-500/15 text-sky-100 border-sky-400/40";
    case "completed":
      return "bg-emerald-500/15 text-emerald-100 border-emerald-400/40";
    case "refunded":
      return "bg-rose-500/15 text-rose-100 border-rose-400/40";
    default:
      return "bg-slate-700 text-slate-200 border-slate-500";
  }
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatOrderTime(value: string, locale: Locale): string {
  const date = parseBackendDate(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleTimeString(locale === "zh" ? "zh-CN" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseBackendDate(value: string): Date {
  const trimmed = value?.trim();
  if (!trimmed) return new Date(NaN);
  const hasTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed);
  return new Date(hasTimezone ? trimmed : `${trimmed}Z`);
}

function mapPaymentMethod(order: BackendOrder): PaymentMethodKey {
  if (order.channel === "in_store") return "cash";
  return "card";
}

function pickItemName(item: BackendOrderItem, locale: Locale): string {
  const display = item.displayName?.trim() ?? "";
  const nameEn = item.nameEn?.trim() ?? "";
  const nameZh = item.nameZh?.trim() ?? "";

  if (locale === "zh") {
    return nameZh || display || nameEn || item.productStableId;
  }
  return nameEn || display || nameZh || item.productStableId;
}

function parseCurrencyToCents(value: string): number {
  const cleaned = value.replace(/[^\d.]/g, "");
  if (!cleaned) return 0;
  const parsed = Number.parseFloat(cleaned);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.round(parsed * 100));
}

type ActionSummary = {
  baseTotal: number;
  baseSubtotal: number;
  baseDiscount: number;
  baseTax: number;
  baseDelivery: number;
  newSubtotal: number;
  newDiscount: number;
  newTax: number;
  newDelivery: number;
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
  reason: string;
  onReasonChange: (value: string) => void;
  selectedItemIds: string[];
  onToggleItem: (id: string) => void;
  replacementInput: string;
  onReplacementChange: (value: string) => void;
  summary: ActionSummary | null;
  canSubmit: boolean;
  onSubmit: () => void;
  isSubmitting: boolean;
};

function ActionContent({
  copy,
  order,
  selectedAction,
  onSelectAction,
  reason,
  onReasonChange,
  selectedItemIds,
  onToggleItem,
  replacementInput,
  onReplacementChange,
  summary,
  canSubmit,
  onSubmit,
  isSubmitting,
}: ActionContentProps) {
  const guide =
    order.paymentMethod === "cash"
      ? copy.cashGuide[selectedAction ?? "retender"]
      : copy.cardGuide[selectedAction ?? "retender"];

  const showItemSelection =
    selectedAction === "void_item" || selectedAction === "swap_item";

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[11px] font-semibold uppercase text-slate-400">
          {copy.orderMetaTitle}
        </div>
        <div className="mt-1 text-xs text-slate-200">
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
              {copy.actionNotice}
            </div>
          </div>
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

          {showItemSelection && (
            <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-200">
              <div className="text-[11px] font-semibold uppercase text-slate-400">
                {copy.itemSelectTitle}
              </div>
              <div className="mt-2 space-y-2">
                {order.items.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-[11px]"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedItemIds.includes(item.id)}
                        onChange={() => onToggleItem(item.id)}
                        className="h-3.5 w-3.5 rounded border-slate-500 bg-slate-900 text-emerald-400"
                      />
                      <div>
                        <div className="text-xs text-slate-100">
                          {item.name}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          x{item.qty} · {formatMoney(item.unitPriceCents)}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-slate-100">
                      {formatMoney(item.totalCents)}
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                {copy.itemSelectHint}
              </div>
              {selectedAction === "swap_item" && (
                <div className="mt-3">
                  <label className="text-[11px] font-semibold uppercase text-slate-400">
                    {copy.replacementLabel}
                  </label>
                  <input
                    value={replacementInput}
                    onChange={(event) => onReplacementChange(event.target.value)}
                    placeholder={copy.replacementPlaceholder}
                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 focus:border-emerald-400 focus:outline-none"
                  />
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-200">
            <label className="text-[11px] font-semibold uppercase text-slate-400">
              {copy.reasonLabel}
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {copy.reasonPresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onReasonChange(preset)}
                  className="rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-[11px] text-slate-200 transition hover:border-emerald-400/60 hover:text-emerald-50"
                >
                  {preset}
                </button>
              ))}
            </div>
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
                <div className="flex items-center justify-between text-slate-300">
                  <span>{copy.summarySubtotal}</span>
                  <span>{formatMoney(summary.newSubtotal)}</span>
                </div>
                {summary.newDiscount > 0 && (
                  <div className="flex items-center justify-between text-slate-300">
                    <span>{copy.summaryDiscount}</span>
                    <span>-{formatMoney(summary.newDiscount)}</span>
                  </div>
                )}
                {summary.newTax > 0 && (
                  <div className="flex items-center justify-between text-slate-300">
                    <span>{copy.summaryTax}</span>
                    <span>{formatMoney(summary.newTax)}</span>
                  </div>
                )}
                {summary.newDelivery > 0 && (
                  <div className="flex items-center justify-between text-slate-300">
                    <span>{copy.summaryDelivery}</span>
                    <span>{formatMoney(summary.newDelivery)}</span>
                  </div>
                )}
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
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit || isSubmitting}
            className={`w-full rounded-xl px-4 py-2 text-xs font-semibold transition ${
              !canSubmit || isSubmitting
                ? "cursor-not-allowed bg-slate-800/60 text-slate-400"
                : "bg-emerald-500/20 text-emerald-50 hover:bg-emerald-500/30"
            }`}
          >
            {isSubmitting ? copy.actionProcessing : copy.actionExecute}
          </button>
        </>
      )}
    </div>
  );
}

export default function PosOrdersPage() {
  const params = useParams<{ locale?: string }>();
  const locale = (params?.locale === "zh" ? "zh" : "en") as Locale;
  const copy = COPY[locale];

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<{
    time: "all" | "today";
    statuses: OrderStatusKey[];
    channels: BackendOrder["channel"][];
    fulfillments: OrderRecord["type"][];
    minTotalCents: number | null;
  }>({
    time: "all",
    statuses: [],
    channels: [],
    fulfillments: [],
    minTotalCents: null,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<ActionKey | null>(null);
  const [reason, setReason] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [replacementInput, setReplacementInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);

  const mapOrder = useCallback(
    (order: BackendOrder): OrderRecord => {
      const subtotalCents = order.subtotalCents ?? order.totalCents ?? 0;
      const discountCents =
        (order.couponDiscountCents ?? 0) + (order.loyaltyRedeemCents ?? 0);
      const subtotalAfterDiscountCents =
        order.subtotalAfterDiscountCents ??
        Math.max(0, subtotalCents - discountCents);
      const taxCents = order.taxCents ?? 0;
      const deliveryFeeCents = order.deliveryFeeCents ?? 0;
      const items = order.items.map((item) => {
        const unitPriceCents = item.unitPriceCents ?? 0;
        return {
          id: item.id,
          name: pickItemName(item, locale),
          qty: item.qty,
          unitPriceCents,
          totalCents: unitPriceCents * item.qty,
        };
      });

      return {
        id: order.id,
        stableId: order.orderStableId ?? order.id,
        pickupCode: order.pickupCode ?? null,
        type: order.fulfillmentType,
        status: order.status,
        amountCents: order.totalCents ?? 0,
        subtotalCents,
        discountCents,
        subtotalAfterDiscountCents,
        taxCents,
        deliveryFeeCents,
        items,
        time: formatOrderTime(order.createdAt, locale),
        channel: order.channel,
        paymentMethod: mapPaymentMethod(order),
        createdAt: order.createdAt,
      };
    },
    [locale],
  );

  useEffect(() => {
    let cancelled = false;

    const fetchOrders = async () => {
      try {
        setIsLoading(true);
        setErrorMessage(null);
        const query =
          "/orders/board?status=pending,paid,making,ready,completed,refunded&sinceMinutes=1440&limit=200";
        const data = await apiFetch<BackendOrder[]>(query);

        if (cancelled) return;

        const mapped = data.map((order) => mapOrder(order));

        setOrders(mapped);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to fetch POS orders:", error);
          setErrorMessage(
            locale === "zh"
              ? "订单加载失败，请稍后再试。"
              : "Failed to load orders. Please try again.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void fetchOrders();

    return () => {
      cancelled = true;
    };
  }, [locale, mapOrder]);

  useEffect(() => {
    if (selectedId && !orders.some((order) => order.id === selectedId)) {
      setSelectedId(null);
      setSelectedAction(null);
      setReason("");
      setSelectedItemIds([]);
      setReplacementInput("");
    }
  }, [orders, selectedId]);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedId) ?? null,
    [orders, selectedId],
  );

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (filters.time === "today") {
        const orderDate = parseBackendDate(order.createdAt);
        const now = new Date();
        if (
          orderDate.getFullYear() !== now.getFullYear() ||
          orderDate.getMonth() !== now.getMonth() ||
          orderDate.getDate() !== now.getDate()
        ) {
          return false;
        }
      }
      if (
        filters.statuses.length > 0 &&
        !filters.statuses.includes(order.status)
      ) {
        return false;
      }
      if (
        filters.channels.length > 0 &&
        !filters.channels.includes(order.channel)
      ) {
        return false;
      }
      if (
        filters.fulfillments.length > 0 &&
        !filters.fulfillments.includes(order.type)
      ) {
        return false;
      }
      if (
        filters.minTotalCents !== null &&
        order.amountCents < filters.minTotalCents
      ) {
        return false;
      }
      return true;
    });
  }, [filters, orders]);

  const summary = useMemo(() => {
    if (!selectedOrder || !selectedAction) return null;
    const baseTotal = selectedOrder.amountCents;
    const baseSubtotal = selectedOrder.subtotalCents;
    const baseDiscount = selectedOrder.discountCents;
    const baseTax = selectedOrder.taxCents;
    const baseDelivery = selectedOrder.deliveryFeeCents;
    const selectedItems = selectedOrder.items.filter((item) =>
      selectedItemIds.includes(item.id),
    );
    const removedCents = selectedItems.reduce(
      (sum, item) => sum + item.totalCents,
      0,
    );
    const replacementCents = parseCurrencyToCents(replacementInput);

    let newSubtotal = baseSubtotal;
    if (selectedAction === "void_item") {
      newSubtotal = baseSubtotal - removedCents;
    } else if (selectedAction === "swap_item") {
      newSubtotal = baseSubtotal - removedCents + replacementCents;
    } else if (selectedAction === "full_refund") {
      newSubtotal = 0;
    }
    newSubtotal = Math.max(0, newSubtotal);

    const newDiscount =
      selectedAction === "full_refund" ? 0 : Math.min(baseDiscount, newSubtotal);
    const newSubtotalAfterDiscount = Math.max(0, newSubtotal - newDiscount);
    const baseAfterDiscount = Math.max(
      0,
      selectedOrder.subtotalAfterDiscountCents,
    );
    const taxRate = baseAfterDiscount > 0 ? baseTax / baseAfterDiscount : 0;
    const newTax =
      selectedAction === "full_refund"
        ? 0
        : Math.round(newSubtotalAfterDiscount * taxRate);
    const newDelivery =
      selectedAction === "full_refund" ? 0 : selectedOrder.deliveryFeeCents;
    const newTotal = newSubtotalAfterDiscount + newTax + newDelivery;

    let refundCents = 0;
    let additionalChargeCents = 0;
    let newChargeCents = 0;

    if (selectedAction === "retender") {
      refundCents = baseTotal;
      newChargeCents = newTotal;
    } else if (selectedAction === "full_refund") {
      refundCents = baseTotal;
    } else {
      const delta = newTotal - baseTotal;
      if (delta > 0) {
        additionalChargeCents = delta;
      } else if (delta < 0) {
        refundCents = Math.abs(delta);
      }
    }

    return {
      baseTotal,
      baseSubtotal,
      baseDiscount,
      baseTax,
      baseDelivery,
      newSubtotal,
      newDiscount,
      newTax,
      newDelivery,
      refundCents,
      additionalChargeCents,
      newChargeCents,
      newTotalCents: newTotal,
      rebillGroupId: null,
    };
  }, [replacementInput, selectedAction, selectedItemIds, selectedOrder]);

  const toggleArrayValue = <T,>(values: T[], value: T) => {
    return values.includes(value)
      ? values.filter((item) => item !== value)
      : [...values, value];
  };

  const handleQuickFilterToggle = (key: (typeof QUICK_FILTERS)[number]) => {
    if (key.type === "time") {
      setFilters((prev) => ({
        ...prev,
        time: prev.time === "today" ? "all" : "today",
      }));
      return;
    }

    if (key.type === "amount") {
      setFilters((prev) => ({
        ...prev,
        minTotalCents:
          prev.minTotalCents === key.value ? null : Number(key.value),
      }));
      return;
    }

    if (key.type === "status") {
      setFilters((prev) => ({
        ...prev,
        statuses: toggleArrayValue(
          prev.statuses,
          key.value as OrderStatusKey,
        ),
      }));
      return;
    }

    setFilters((prev) => ({
      ...prev,
      fulfillments: toggleArrayValue(
        prev.fulfillments,
        key.value as OrderRecord["type"],
      ),
    }));
  };

  const handleToggleItem = (id: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSelectAction = (action: ActionKey) => {
    setSelectedAction(action);
    if (action !== "void_item" && action !== "swap_item") {
      setSelectedItemIds([]);
      setReplacementInput("");
    }
  };

  const showItemSelection =
    selectedAction === "void_item" || selectedAction === "swap_item";

  const canSubmit =
    Boolean(selectedAction) &&
    reason.trim().length > 0 &&
    (!showItemSelection || selectedItemIds.length > 0);

  const handleSubmit = () => {
    if (!selectedOrder || !selectedAction) return;
    if (!canSubmit) return;
    const completeAction = () => {
      alert(copy.actionSuccess);
      setSelectedId(null);
      setSelectedAction(null);
      setReason("");
      setSelectedItemIds([]);
      setReplacementInput("");
    };
    if (selectedAction !== "full_refund") {
      setIsSubmitting(true);
      window.setTimeout(() => {
        setIsSubmitting(false);
        completeAction();
      }, 500);
      return;
    }

    const submitRefund = async () => {
      try {
        setIsSubmitting(true);
        const updated = await updateOrderStatus<BackendOrder>(
          selectedOrder.id,
          "refunded",
        );
        const mapped = mapOrder(updated);
        setOrders((prev) =>
          prev.map((order) => (order.id === mapped.id ? mapped : order)),
        );
        setSelectedId(mapped.id);
        alert(copy.actionSuccess);
      } catch (error) {
        console.error("Failed to refund order:", error);
        alert(copy.refundFailed);
      } finally {
        setIsSubmitting(false);
      }
    };

    void submitRefund();
  };

  const handleAdvanceStatus = async () => {
    if (!selectedOrder || isAdvancing) return;
    try {
      setIsAdvancing(true);
      const updated = await advanceOrder<BackendOrder>(selectedOrder.id);
      const mapped = mapOrder(updated);
      setOrders((prev) =>
        prev.map((order) => (order.id === mapped.id ? mapped : order)),
      );
      setSelectedId(mapped.id);
      alert(copy.advanceSuccess);
    } catch (error) {
      console.error("Failed to advance order status:", error);
      alert(copy.advanceFailed);
    } finally {
      setIsAdvancing(false);
    }
  };

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

      <section className="grid gap-4 px-6 py-4 lg:grid-cols-[1.05fr_1.6fr_1.2fr]">
        <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{copy.filtersTitle}</h2>
              <p className="text-xs text-slate-300">{copy.filtersSubtitle}</p>
            </div>
            <span className="rounded-full border border-slate-600 bg-slate-800 px-2.5 py-1 text-[11px] text-slate-200">
              {filteredOrders.length}/{orders.length}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {QUICK_FILTERS.map((filter) => {
              const active =
                (filter.type === "time" && filters.time === "today") ||
                (filter.type === "status" &&
                  filters.statuses.includes(filter.value as OrderStatusKey)) ||
                (filter.type === "fulfillment" &&
                  filters.fulfillments.includes(
                    filter.value as OrderRecord["type"],
                  )) ||
                (filter.type === "amount" &&
                  filters.minTotalCents === Number(filter.value));

              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => handleQuickFilterToggle(filter)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    active
                      ? "border-emerald-400/70 bg-emerald-500/15 text-emerald-50"
                      : "border-slate-600 bg-slate-900/40 text-slate-200"
                  }`}
                >
                  {locale === "zh" ? filter.label.zh : filter.label.en}
                </button>
              );
            })}
          </div>
          <div className="mt-4 grid gap-3 text-xs text-slate-300">
            <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3">
              <div className="text-[11px] uppercase text-slate-400">Channels</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(
                  [
                    { key: "in_store", label: copy.channelLabel.in_store },
                    { key: "web", label: copy.channelLabel.web },
                    { key: "ubereats", label: copy.channelLabel.ubereats },
                  ] as const
                ).map((item) => {
                  const active = filters.channels.includes(item.key);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() =>
                        setFilters((prev) => ({
                          ...prev,
                          channels: toggleArrayValue(prev.channels, item.key),
                        }))
                      }
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                        active
                          ? "border-emerald-400/70 bg-emerald-500/15 text-emerald-50"
                          : "border-slate-700 bg-slate-800 text-slate-200"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3">
              <div className="text-[11px] uppercase text-slate-400">Amount</div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-300">
                {[
                  { label: "$0+", value: 0 },
                  { label: "$50+", value: 5000 },
                  { label: "$100+", value: 10000 },
                ].map((option) => {
                  const active = filters.minTotalCents === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setFilters((prev) => ({
                          ...prev,
                          minTotalCents:
                            prev.minTotalCents === option.value
                              ? null
                              : option.value,
                        }))
                      }
                      className={`rounded-full border px-2 py-1 transition ${
                        active
                          ? "border-emerald-400/70 bg-emerald-500/15 text-emerald-50"
                          : "border-slate-700 text-slate-200"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
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
            {isLoading && orders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-6 text-center text-xs text-slate-400">
                {locale === "zh" ? "正在加载订单..." : "Loading orders..."}
              </div>
            ) : null}
            {errorMessage ? (
              <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-center text-xs text-rose-100">
                {errorMessage}
              </div>
            ) : null}
            {filteredOrders.map((order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => {
                  setSelectedId(order.id);
                  setSelectedAction("retender");
                  setReason("");
                  setSelectedItemIds([]);
                  setReplacementInput("");
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition hover:border-slate-400 hover:bg-slate-800/70 ${
                  order.id === selectedId
                    ? "border-emerald-400/70 bg-emerald-500/10"
                    : "border-slate-700 bg-slate-900/40"
                }`}
              >
                <div>
                <div className="text-sm font-semibold">
                  {order.pickupCode ?? order.stableId}
                </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                    <span className="rounded-full border border-slate-600 px-2 py-0.5">
                      {copy.orderCard[order.type]}
                    </span>
                    <span className="rounded-full border border-slate-700 px-2 py-0.5">
                      {copy.channelLabel[order.channel]}
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
            {!isLoading && !errorMessage && filteredOrders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-6 text-center text-xs text-slate-400">
                {locale === "zh" ? "暂无订单数据。" : "No orders found."}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4">
          <div>
            <h2 className="text-lg font-semibold">{copy.actionsTitle}</h2>
            <p className="text-xs text-slate-300">{copy.actionsSubtitle}</p>
          </div>
          {selectedOrder ? (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase text-slate-400">
                    {copy.pickupCodeLabel}
                  </div>
                  <div className="text-2xl font-semibold">
                    {selectedOrder.pickupCode ?? "--"}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {copy.stableIdLabel}: {selectedOrder.stableId}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAdvanceStatus}
                  disabled={
                    isAdvancing ||
                    selectedOrder.status === "completed" ||
                    selectedOrder.status === "refunded"
                  }
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    isAdvancing ||
                    selectedOrder.status === "completed" ||
                    selectedOrder.status === "refunded"
                      ? "cursor-not-allowed border-slate-700 bg-slate-800 text-slate-400"
                      : "border-emerald-400/70 bg-emerald-500/15 text-emerald-50 hover:bg-emerald-500/25"
                  }`}
                >
                  {isAdvancing ? copy.advanceProcessing : copy.advanceStatus}
                </button>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
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
              <ActionContent
                copy={copy}
                order={selectedOrder}
                selectedAction={selectedAction}
                onSelectAction={handleSelectAction}
                reason={reason}
                onReasonChange={setReason}
                selectedItemIds={selectedItemIds}
                onToggleItem={handleToggleItem}
                replacementInput={replacementInput}
                onReplacementChange={setReplacementInput}
                summary={summary}
                canSubmit={canSubmit}
                onSubmit={handleSubmit}
                isSubmitting={isSubmitting}
              />
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-6 text-center text-xs text-slate-400">
              {copy.emptySelection}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
