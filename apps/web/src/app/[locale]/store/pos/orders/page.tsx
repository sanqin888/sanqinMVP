// apps/web/src/app/[locale]/store/pos/orders/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Locale } from "@/lib/i18n/locales";
import type {
  AdminMenuFull,
  TemplateGroupFullDto as MenuTemplateFull,
} from "@shared/menu";
import {
  buildLocalizedMenuFromDb,
  type PublicMenuCategory,
} from "@/lib/menu/menu-transformer";
import {
  advanceOrder,
  createOrderAmendment,
  fetchRecentOrders,
  printOrderCloud,
  updateOrderStatus,
} from "@/lib/api/pos";
import type { CreateOrderAmendmentInput } from "@/lib/api/pos";
import { apiFetch } from "@/lib/api/client";
import { parseBackendDate, ymdInTimeZone } from "@/lib/time/tz";

const COPY = {
  zh: {
    title: "订单管理",
    subtitle: "全量查询与复杂筛选，用于门店订单追踪。",
    backToPos: "返回 POS 点单",
    filtersTitle: "筛选条件",
    filtersReset: "重置",
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
    orderDetailAction: "订单详情",
    printReceiptAction: "打印收据",
    emptySelection: "请选择左侧订单查看功能。",
    orderNumberLabel: "订单编号",
    stableIdLabel: "Stable ID",
    orderMetaTitle: "订单信息",
    actionLabels: {
      retender: "更改支付方式（Re-tender）",
      void_item: "退菜 = 部分退款 / 作废单品（Void Item）",
      swap_item: "换菜 = 退旧 + 加新 + 差额补收/差额退款",
      full_refund: "全单退款",
    },
    close: "关闭",
    swapItemTitle: "选择新菜品",
    swapItemHint: "请选择需要换上的新菜品（含选项）。",
    swapItemEmpty: "尚未选择新菜品。",
    swapItemSelect: "选择新菜品",
    swapItemChange: "更换菜品",
    swapItemClear: "清空新菜品",
    swapItemQty: "数量",
    swapItemPrice: "小计",
    swapItemDialogTitle: "选择新菜品",
    swapItemDialogSubtitle: "完成必选项后加入换菜。",
    swapItemConfirm: "确定选择",
    optionsRequired: "请先选择所有必选项",
    optionLimit: (min: number, max: number | null) =>
      max === null || max === min
        ? `至少选 ${min} 项`
        : `请选择 ${min}-${max} 项`,
    actionNotice: "请选择需要处理的订单操作。",
    actionExecute: "执行操作",
    actionProcessing: "处理中...",
    actionSuccess: "已提交订单操作。",
    advanceStatus: "推进状态",
    advanceProcessing: "推进中...",
    advanceSuccess: "订单状态已推进。",
    advanceFailed: "推进失败，请稍后重试。",
    advanceTerminal: "终态",
    refundFailed: "退款失败，请稍后重试。",
    reasonLabel: "操作原因",
    reasonPlaceholder: "请输入原因（必填）",
    methodLabel: "退款/新支付方式",
    methodPlaceholder: "请选择退款或新付款方式",
    methodOptions: {
      CASH: "现金",
      CARD: "银行卡",
      WECHAT_ALIPAY: "微信/支付宝",
      STORE_BALANCE: "储值余额",
    },
    reasonPresets: ["顾客取消", "商品售罄", "操作失误", "支付方式调整"],
    itemSelectTitle: "选择退/换菜品",
    itemSelectHint: "退菜/换菜必须勾选对应菜品。",
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
    filtersReset: "Reset",
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
    orderDetailAction: "Order details",
    printReceiptAction: "Print receipt",
    emptySelection: "Select an order to view actions.",
    orderNumberLabel: "Order Number",
    stableIdLabel: "Stable ID",
    orderMetaTitle: "Order info",
    actionLabels: {
      retender: "Re-tender payment method",
      void_item: "Void item = partial refund / cancel item",
      swap_item: "Swap item = return old + add new + settle difference",
      full_refund: "Full refund",
    },
    close: "Close",
    swapItemTitle: "Select replacement item",
    swapItemHint: "Choose the new item (with options).",
    swapItemEmpty: "No replacement item selected.",
    swapItemSelect: "Choose item",
    swapItemChange: "Change item",
    swapItemClear: "Clear selection",
    swapItemQty: "Qty",
    swapItemPrice: "Subtotal",
    swapItemDialogTitle: "Choose replacement item",
    swapItemDialogSubtitle: "Complete required options before adding.",
    swapItemConfirm: "Confirm selection",
    optionsRequired: "Please complete required options",
    optionLimit: (min: number, max: number | null) =>
      max === null || max === min
        ? `Select at least ${min}`
        : `Select ${min}-${max}`,
    actionNotice: "Select an action to continue.",
    actionExecute: "Execute action",
    actionProcessing: "Processing...",
    actionSuccess: "Order action submitted.",
    advanceStatus: "Advance status",
    advanceProcessing: "Advancing...",
    advanceSuccess: "Order status advanced.",
    advanceFailed: "Failed to advance status. Please retry.",
    advanceTerminal: "Terminal",
    refundFailed: "Refund failed. Please retry.",
    reasonLabel: "Reason",
    reasonPlaceholder: "Enter reason (required)",
    methodLabel: "Refund / New payment method",
    methodPlaceholder: "Select refund or new payment method",
    methodOptions: {
      CASH: "Cash",
      CARD: "Card",
      WECHAT_ALIPAY: "WeChat / Alipay",
      STORE_BALANCE: "Store balance",
    },
    reasonPresets: [
      "Customer cancellation",
      "Item out of stock",
      "Operator mistake",
      "Payment adjustment",
    ],
    itemSelectTitle: "Select items to void/swap",
    itemSelectHint: "Void/swap requires selecting the items to change.",
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

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function calcOptionDeltaCents(
  item: SwapSelection["item"],
  selectedOptions: Record<string, string[]>,
): number {
  return (item.optionGroups ?? []).reduce((groupSum, group) => {
    const selected = selectedOptions[group.templateGroupStableId] ?? [];
    if (selected.length === 0) return groupSum;
    const optionSum = group.options
      .filter((option) => selected.includes(option.optionStableId))
      .reduce((sum, option) => sum + option.priceDeltaCents, 0);
    return groupSum + optionSum;
  }, 0);
}

function calcSwapTotalCents(selection: SwapSelection | null): number {
  if (!selection) return 0;
  const unitPriceCents =
    Math.round(selection.item.price * 100) +
    calcOptionDeltaCents(selection.item, selection.options);
  return unitPriceCents * selection.quantity;
}

type OrderStatusKey = keyof (typeof COPY)["zh"]["status"];
type ActionKey = keyof (typeof COPY)["zh"]["actionLabels"];
type PaymentMethodKey = keyof (typeof COPY)["zh"]["paymentMethod"];
type AmendmentPaymentMethod = Exclude<
  NonNullable<CreateOrderAmendmentInput["paymentMethod"]>,
  "UBEREATS"
>;

const PAYMENT_METHOD_OPTIONS: AmendmentPaymentMethod[] = [
  "CASH",
  "CARD",
  "WECHAT_ALIPAY",
  "STORE_BALANCE",
];

function pickItemName(
  item: Pick<BackendOrderItem, "displayName" | "nameEn" | "nameZh" | "productStableId">,
  locale: Locale,
): string {
  const display = item.displayName?.trim() ?? "";
  const en = item.nameEn?.trim() ?? "";
  const zh = item.nameZh?.trim() ?? "";
  return locale === "zh"
    ? zh || display || en || item.productStableId
    : en || display || zh || item.productStableId;
}

function formatOrderTime(value: string, locale: Locale, timeZone: string): string {
  const date = parseBackendDate(value);
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-CA", {
    timeZone,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function mapPaymentMethod(order: BackendOrder): PaymentMethodKey {
  const raw = (order as { paymentMethod?: string | null }).paymentMethod;
  if (raw === "cash" || raw === "card") return raw;
  return order.channel === "in_store" ? "cash" : "card";
}

function defaultAmendmentPaymentMethod(order: OrderRecord): AmendmentPaymentMethod {
  return order.paymentMethod === "cash" ? "CASH" : "CARD";
}

function statusTone(status: OrderStatusKey): string {
  switch (status) {
    case "pending":
      return "border-amber-400/40 bg-amber-500/10 text-amber-100";
    case "paid":
      return "border-blue-400/40 bg-blue-500/10 text-blue-100";
    case "making":
      return "border-violet-400/40 bg-violet-500/10 text-violet-100";
    case "ready":
      return "border-cyan-400/40 bg-cyan-500/10 text-cyan-100";
    case "completed":
      return "border-emerald-400/40 bg-emerald-500/10 text-emerald-100";
    case "refunded":
      return "border-rose-400/40 bg-rose-500/10 text-rose-100";
    default:
      return "border-slate-600 bg-slate-700/40 text-slate-100";
  }
}

type OrderFilters = {
  time: "all" | "today";
  statuses: OrderStatusKey[];
  channels: BackendOrder["channel"][];
  fulfillments: OrderRecord["type"][];
  minTotalCents: number | null;
};

const createInitialFilters = (): OrderFilters => ({
  time: "all",
  statuses: [],
  channels: [],
  fulfillments: [],
  minTotalCents: null,
});

const ACTIONS: ActionKey[] = [
  "retender",
  "void_item",
  "swap_item",
  "full_refund",
];

const NEXT_STATUS: Record<OrderStatusKey, OrderStatusKey | null> = {
  pending: "paid",
  paid: "making",
  making: "ready",
  ready: "completed",
  completed: null,
  refunded: null,
};

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
  orderStableId: string;
  clientRequestId?: string | null;
  orderNumber?: string | null;
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
  productStableId: string;
  qty: number;
  displayName?: string | null;
  nameEn?: string | null;
  nameZh?: string | null;
  unitPriceCents?: number | null;
};

type OrderRecord = {
  stableId: string;
  pickupCode: string | null;
  clientRequestId: string | null;
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
  stableId: string;
  name: string;
  nameEn?: string | null;
  nameZh?: string | null;
  displayName?: string | null;
  qty: number;
  unitPriceCents: number;
  totalCents: number;
};

type SwapSelection = {
  item: PublicMenuCategory["items"][number];
  options: Record<string, string[]>;
  quantity: number;
};

function compareOrderCreatedAtAsc(a: OrderRecord, b: OrderRecord) {
  const aTime = parseBackendDate(a.createdAt).getTime();
  const bTime = parseBackendDate(b.createdAt).getTime();
  return aTime - bTime;
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
  summary: ActionSummary | null;
  selectedPaymentMethod: AmendmentPaymentMethod | null;
  onPaymentMethodChange: (value: AmendmentPaymentMethod) => void;
  shouldShowPaymentMethodPicker: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  isSubmitting: boolean;
  isActionDisabled: (action: ActionKey) => boolean;
  swapSelection: SwapSelection | null;
  onSwapChoose: () => void;
  onSwapClear: () => void;
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
  summary,
  selectedPaymentMethod,
  onPaymentMethodChange,
  shouldShowPaymentMethodPicker,
  canSubmit,
  onSubmit,
  isSubmitting,
  isActionDisabled,
  swapSelection,
  onSwapChoose,
  onSwapClear,
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
            disabled={isActionDisabled(actionKey)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              selectedAction === actionKey
                ? "border-emerald-400/70 bg-emerald-500/15 text-emerald-50"
                : "border-slate-700 bg-slate-900/40 text-slate-200"
            } ${
              isActionDisabled(actionKey)
                ? "cursor-not-allowed border-slate-800 bg-slate-900/60 text-slate-500"
                : "hover:border-emerald-400/60"
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
                    key={item.stableId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-[11px]"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedItemIds.includes(item.stableId)}
                        onChange={() => onToggleItem(item.stableId)}
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
                  <div className="text-[11px] font-semibold uppercase text-slate-400">
                    {copy.swapItemTitle}
                  </div>
                  <div className="mt-2 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-100">
                    {swapSelection ? (
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold">
                              {swapSelection.item.name}
                            </div>
                            {swapSelection.item.optionGroups &&
                            swapSelection.item.optionGroups.length > 0 ? (
                              <div className="mt-1 space-y-1 text-[11px] text-slate-400">
                                {(swapSelection.item.optionGroups ?? []).map(
                                  (group) => {
                                    const selected =
                                      swapSelection.options[
                                        group.templateGroupStableId
                                      ] ?? [];
                                    if (selected.length === 0) return null;
                                    const groupName =
                                      group.template.nameZh ??
                                      group.template.nameEn;
                                    const optionLabels = group.options
                                      .filter((opt) =>
                                        selected.includes(opt.optionStableId),
                                      )
                                      .map((opt) => opt.nameZh ?? opt.nameEn)
                                      .join(", ");
                                    return (
                                      <div key={group.templateGroupStableId}>
                                        {groupName}: {optionLabels}
                                      </div>
                                    );
                                  },
                                )}
                              </div>
                            ) : null}
                          </div>
                          <div className="text-right">
                            <div className="text-[11px] text-slate-400">
                              {copy.swapItemQty}: {swapSelection.quantity}
                            </div>
                            <div className="text-sm font-semibold">
                              {formatMoney(calcSwapTotalCents(swapSelection))}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={onSwapChoose}
                            className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-[11px] text-slate-200 hover:border-emerald-400/60"
                          >
                            {copy.swapItemChange}
                          </button>
                          <button
                            type="button"
                            onClick={onSwapClear}
                            className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-[11px] text-slate-200 hover:border-emerald-400/60"
                          >
                            {copy.swapItemClear}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-400">
                          {copy.swapItemEmpty}
                        </span>
                        <button
                          type="button"
                          onClick={onSwapChoose}
                          className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-[11px] text-slate-200 hover:border-emerald-400/60"
                        >
                          {copy.swapItemSelect}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400">
                    {copy.swapItemHint}
                  </div>
                </div>
              )}
            </div>
          )}


          {shouldShowPaymentMethodPicker && (
            <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-200">
              <label className="text-[11px] font-semibold uppercase text-slate-400">
                {copy.methodLabel}
              </label>
              <select
                value={selectedPaymentMethod ?? ""}
                onChange={(event) =>
                  onPaymentMethodChange(event.target.value as AmendmentPaymentMethod)
                }
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 focus:border-emerald-400 focus:outline-none"
              >
                <option value="" disabled>
                  {copy.methodPlaceholder}
                </option>
                {PAYMENT_METHOD_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {copy.methodOptions[option]}
                  </option>
                ))}
              </select>
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
  type BusinessConfigLite = { timezone: string };
  const params = useParams<{ locale?: string }>();
  const locale = (params?.locale === "zh" ? "zh" : "en") as Locale;
  const copy = COPY[locale];

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<OrderFilters>(createInitialFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<ActionKey | null>(null);
  const [reason, setReason] = useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<AmendmentPaymentMethod | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [menuCategories, setMenuCategories] = useState<PublicMenuCategory[]>(
    [],
  );
  const [swapSelection, setSwapSelection] = useState<SwapSelection | null>(
    null,
  );
  const [swapActiveItem, setSwapActiveItem] = useState<SwapSelection | null>(
    null,
  );
  const [isSwapPickerOpen, setIsSwapPickerOpen] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);

  const showToast = useCallback(
    (message: string, tone: "success" | "error" = "success") => {
      setToast({ message, tone });
    },
    [],
  );

  const [storeTimezone, setStoreTimezone] = useState<string>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  });

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setToast(null);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filtersDirty =
    filters.time !== "all" ||
    filters.statuses.length > 0 ||
    filters.channels.length > 0 ||
    filters.fulfillments.length > 0 ||
    filters.minTotalCents !== null;

  const handleResetOrderFilters = () => {
    setFilters(createInitialFilters());
  };

const mapOrder = useCallback(
  (order: BackendOrder, timeZone: string): OrderRecord => {
    const subtotalCents = order.subtotalCents ?? order.totalCents ?? 0;
    const discountCents =
      (order.couponDiscountCents ?? 0) + (order.loyaltyRedeemCents ?? 0);
    const subtotalAfterDiscountCents =
      order.subtotalAfterDiscountCents ??
      Math.max(0, subtotalCents - discountCents);
    const taxCents = order.taxCents ?? 0;
    const deliveryFeeCents = order.deliveryFeeCents ?? 0;
    const displayNumber =
      order.clientRequestId?.trim() ||
      order.orderNumber?.trim() ||
      order.pickupCode?.trim() ||
      order.orderStableId;

    const items = order.items.map((item) => {
      const unitPriceCents = item.unitPriceCents ?? 0;
      return {
        stableId: item.productStableId,
        name: pickItemName(item, locale),
        nameEn: item.nameEn ?? null,
        nameZh: item.nameZh ?? null,
        displayName: item.displayName ?? null,
        qty: item.qty,
        unitPriceCents,
        totalCents: unitPriceCents * item.qty,
      };
    });

    return {
      stableId: order.orderStableId,
      pickupCode: order.pickupCode ?? null,
      clientRequestId: displayNumber,
      type: order.fulfillmentType,
      status: order.status,
      amountCents: order.totalCents ?? 0,
      subtotalCents,
      discountCents,
      subtotalAfterDiscountCents,
      taxCents,
      deliveryFeeCents,
      items,
      time: formatOrderTime(order.createdAt, locale, timeZone),
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
        const [configRes, data] = await Promise.all([
          apiFetch<BusinessConfigLite>("/admin/business/config").catch(() => null),
          fetchRecentOrders<BackendOrder[]>(10),
        ]);

        if (cancelled) return;

        const tz =
          configRes?.timezone?.trim() ||
          (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");

        setStoreTimezone(tz);

        const mapped = data.map((order: BackendOrder) => mapOrder(order, tz));
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
    if (selectedId && !orders.some((order) => order.stableId === selectedId)) {
      setSelectedId(null);
      setSelectedAction(null);
      setReason("");
      setSelectedItemIds([]);
      setSwapSelection(null);
      setSwapActiveItem(null);
    }
  }, [orders, selectedId]);

  useEffect(() => {
    let cancelled = false;

    async function loadMenu() {
      try {
        const [menuResponse, templateGroups] = await Promise.all([
          apiFetch<AdminMenuFull>("/admin/menu/full"),
          apiFetch<MenuTemplateFull[]>("/admin/menu/option-group-templates"),
        ]);
        if (cancelled) return;
        const localized = buildLocalizedMenuFromDb(
          menuResponse.categories ?? [],
          locale,
          templateGroups ?? [],
        );
        setMenuCategories(localized);
      } catch (error) {
        console.error("Failed to load POS menu for swap:", error);
      }
    }

    void loadMenu();

    return () => {
      cancelled = true;
    };
  }, [locale]);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.stableId === selectedId) ?? null,
    [orders, selectedId],
  );

  useEffect(() => {
    if (!selectedOrder) {
      setSelectedPaymentMethod(null);
      return;
    }
    setSelectedPaymentMethod(defaultAmendmentPaymentMethod(selectedOrder));
  }, [selectedOrder]);

  const filteredOrders = useMemo(() => {
    return orders
      .filter((order) => {
        if (filters.time === "today") {
          const orderDate = parseBackendDate(order.createdAt);
          const now = new Date();

          const tz = storeTimezone || "UTC";
          const orderYmd = ymdInTimeZone(orderDate, tz);
          const nowYmd = ymdInTimeZone(now, tz);

          if (orderYmd !== nowYmd) return false;
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
      })
      .sort(compareOrderCreatedAtAsc);
  }, [filters, orders, storeTimezone]);

  const summary = useMemo(() => {
    if (!selectedOrder || !selectedAction) return null;
    const baseTotal = selectedOrder.amountCents;
    const baseSubtotal = selectedOrder.subtotalCents;
    const baseDiscount = selectedOrder.discountCents;
    const baseTax = selectedOrder.taxCents;
    const baseDelivery = selectedOrder.deliveryFeeCents;
    const selectedItems = selectedOrder.items.filter((item) =>
      selectedItemIds.includes(item.stableId),
    );
    const removedCents = selectedItems.reduce(
      (sum, item) => sum + item.totalCents,
      0,
    );
    const replacementCents =
      selectedAction === "swap_item" ? calcSwapTotalCents(swapSelection) : 0;

    let nextSubtotal = baseSubtotal;
    if (selectedAction === "void_item") {
      nextSubtotal = baseSubtotal - removedCents;
    } else if (selectedAction === "swap_item") {
      nextSubtotal = baseSubtotal - removedCents + replacementCents;
    } else if (selectedAction === "full_refund") {
      nextSubtotal = 0;
    }
    const newSubtotal = Math.max(0, nextSubtotal);

    const newDiscount =
      selectedAction === "full_refund"
        ? 0
        : baseSubtotal > 0
          ? Math.round((baseDiscount * newSubtotal) / baseSubtotal)
          : 0;
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
  }, [selectedAction, selectedItemIds, selectedOrder, swapSelection]);

  function toggleArrayValue<T>(values: T[], value: T): T[] {
    return values.includes(value)
      ? values.filter((item) => item !== value)
      : [...values, value];
  }

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

    if (key.type === "fulfillment") {
      setFilters((prev) => ({
        ...prev,
        fulfillments: toggleArrayValue(
          prev.fulfillments,
          key.value as OrderRecord["type"],
        ),
      }));
      return;
    }
   };

  const handleToggleItem = (id: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSelectAction = (action: ActionKey) => {
    setSelectedAction(action);
    if (selectedOrder) {
      setSelectedPaymentMethod(defaultAmendmentPaymentMethod(selectedOrder));
    }
    if (action !== "void_item" && action !== "swap_item") {
      setSelectedItemIds([]);
      setSwapSelection(null);
      setSwapActiveItem(null);
    }
    if (action !== "swap_item") {
      setSwapSelection(null);
      setSwapActiveItem(null);
    }
  };

  const showItemSelection =
    selectedAction === "void_item" || selectedAction === "swap_item";

  const isActionDisabled = useCallback(
    (action: ActionKey) => {
      if (action === "full_refund") {
        return selectedOrder?.status === "refunded";
      }
      return false;
    },
    [selectedOrder?.status],
  );

  const shouldShowPaymentMethodPicker =
    selectedAction === "retender" ||
    selectedAction === "full_refund" ||
    ((selectedAction === "void_item" || selectedAction === "swap_item") &&
      (summary?.refundCents ?? 0) > 0);

  const canSubmit =
    Boolean(selectedAction) &&
    reason.trim().length > 0 &&
    (!showItemSelection || selectedItemIds.length > 0) &&
    (selectedAction !== "swap_item" || Boolean(swapSelection)) &&
    (!shouldShowPaymentMethodPicker || Boolean(selectedPaymentMethod)) &&
    (selectedAction ? !isActionDisabled(selectedAction) : false);

  const openSwapItemDialog = (
    item: PublicMenuCategory["items"][number],
  ) => {
    setSwapActiveItem({
      item,
      options: {},
      quantity: 1,
    });
  };

  const selectSwapItem = (item: PublicMenuCategory["items"][number]) => {
    if (item.optionGroups && item.optionGroups.length > 0) {
      openSwapItemDialog(item);
    } else {
      setSwapSelection({ item, options: {}, quantity: 1 });
    }
    setIsSwapPickerOpen(false);
  };

  const updateSwapOptionSelection = (
    groupId: string,
    optionId: string,
    maxSelect: number | null,
  ) => {
    setSwapActiveItem((prev) => {
      if (!prev) return prev;
      const current = prev.options[groupId] ?? [];
      let next: string[];
      if (current.includes(optionId)) {
        next = current.filter((id) => id !== optionId);
      } else {
        if (maxSelect === 1) {
          next = [optionId];
        } else if (typeof maxSelect === "number" && current.length >= maxSelect) {
          next = [...current.slice(1), optionId];
        } else {
          next = [...current, optionId];
        }
      }
      return {
        ...prev,
        options: {
          ...prev.options,
          [groupId]: next,
        },
      };
    });
  };

  const swapOptionGroups = swapActiveItem?.item.optionGroups ?? [];
  const swapRequiredGroupsMissing =
    swapActiveItem?.item.optionGroups?.filter((group) => {
      if (group.minSelect <= 0) return false;
      const selectedCount =
        swapActiveItem.options[group.templateGroupStableId]?.length ?? 0;
      return selectedCount < group.minSelect;
    }) ?? [];
  const canConfirmSwapSelection =
    Boolean(swapActiveItem) && swapRequiredGroupsMissing.length === 0;

  const confirmSwapSelection = () => {
    if (!swapActiveItem || !canConfirmSwapSelection) return;
    setSwapSelection(swapActiveItem);
    setSwapActiveItem(null);
  };

const handleSubmit = () => {
  if (!selectedOrder || !selectedAction) return;
  if (!canSubmit) return;

  const selectedItems = selectedOrder.items.filter((item) =>
    selectedItemIds.includes(item.stableId),
  );

  const completeReset = () => {
    setSelectedId(null);
    setSelectedAction(null);
    setReason("");
    setSelectedPaymentMethod(null);
    setSelectedItemIds([]);
    setSwapSelection(null);
    setSwapActiveItem(null);
  };

  // === full_refund：按你原逻辑（改订单状态） ===
  if (selectedAction === "full_refund") {
    if (isActionDisabled("full_refund")) return;

    void (async () => {
      try {
        setIsSubmitting(true);
        const updated = await updateOrderStatus<BackendOrder>(
          selectedOrder.stableId,
          "refunded",
        );
        const mapped = mapOrder(updated, storeTimezone);
        setOrders((prev) =>
          prev.map((order) =>
            order.stableId === mapped.stableId ? mapped : order,
          ),
        );
        setSelectedId(mapped.stableId);
        showToast(copy.actionSuccess, "success");
      } catch (error) {
        console.error("Failed to refund order:", error);
        showToast(copy.refundFailed, "error");
      } finally {
        setIsSubmitting(false);
      }
    })();

    return;
  }

  // === 其他动作：create amendment ===
  void (async () => {
    try {
      setIsSubmitting(true);

      if (!summary) throw new Error("summary is missing");

      // 1) action -> amendment type（关键：显式标注类型，避免变成 string）
      const amendmentType: CreateOrderAmendmentInput["type"] =
        selectedAction === "retender"
          ? "RETENDER"
          : selectedAction === "void_item"
            ? "VOID_ITEM"
            : selectedAction === "swap_item"
              ? "SWAP_ITEM"
              : "ADDITIONAL_CHARGE";

      // 2) items
      const voidItems =
        selectedAction === "void_item" || selectedAction === "swap_item"
          ? selectedItems.map((it) => ({
              action: "VOID" as const,
              productStableId: it.stableId,
              qty: it.qty,
              unitPriceCents: it.unitPriceCents,
              displayName: it.displayName ?? it.name,
              nameEn: it.nameEn ?? null,
              nameZh: it.nameZh ?? null,
            }))
          : [];

      const addItems =
        selectedAction === "swap_item" && swapSelection
          ? [
              {
                action: "ADD" as const,
                productStableId: swapSelection.item.stableId,
                qty: swapSelection.quantity,
                unitPriceCents:
                  Math.round(swapSelection.item.price * 100) +
                  calcOptionDeltaCents(
                    swapSelection.item,
                    swapSelection.options,
                  ),
                displayName: swapSelection.item.name,
                nameEn: swapSelection.item.nameEn ?? null,
                nameZh: swapSelection.item.nameZh ?? null,
                optionsJson: swapSelection.options, // dev: raw
              },
            ]
          : [];

      // ✅ RETENDER：必须 items 为空（按后端校验）
      const items =
        selectedAction === "retender" ? [] : [...voidItems, ...addItems];

      // 3) 金额口径（对齐后端字段语义）
      let refundGrossCents = 0;
      let additionalChargeCents = 0;

      if (selectedAction === "retender") {
        refundGrossCents = Math.max(0, Math.round(summary.baseTotal));
        additionalChargeCents = Math.max(0, Math.round(summary.newChargeCents));
      } else {
        refundGrossCents = Math.max(0, Math.round(summary.refundCents));
        additionalChargeCents = Math.max(
          0,
          Math.round(summary.additionalChargeCents),
        );
      }

      const payload: CreateOrderAmendmentInput = {
        type: amendmentType,
        reason: reason.trim(),
        paymentMethod: shouldShowPaymentMethodPicker ? selectedPaymentMethod : null,
        refundGrossCents,
        additionalChargeCents,
        items,
      };

      const updated = await createOrderAmendment<BackendOrder>(
        selectedOrder.stableId,
        payload,
      );

      const mapped = mapOrder(updated, storeTimezone);
      setOrders((prev) =>
        prev.map((order) =>
          order.stableId === mapped.stableId ? mapped : order,
        ),
      );

      if (selectedAction === "void_item" || selectedAction === "swap_item") {
        await printOrderCloud(selectedOrder.stableId);
      }

      showToast(copy.actionSuccess, "success");
      completeReset();
    } catch (error) {
      console.error("Failed to submit amendment:", error);
      showToast(copy.refundFailed, "error");
    } finally {
      setIsSubmitting(false);
    }
  })();
};

  const handleAdvanceStatus = async () => {
    if (!selectedOrder || isAdvancing) return;
    const nextStatus = NEXT_STATUS[selectedOrder.status];
    if (!nextStatus) return;
    try {
      setIsAdvancing(true);
    const updated = await advanceOrder<BackendOrder>(selectedOrder.stableId);
    const mapped = mapOrder(updated, storeTimezone);
    setOrders((prev) =>
      prev.map((order) =>
        order.stableId === mapped.stableId ? mapped : order,
      ),
    );
    setSelectedId(mapped.stableId);
      showToast(copy.advanceSuccess, "success");
    } catch (error) {
      console.error("Failed to advance order status:", error);
      showToast(copy.advanceFailed, "error");
    } finally {
      setIsAdvancing(false);
    }
  };

  const handlePrintReceipt = useCallback(async () => {
    if (!selectedOrder) return;

    try {
      await printOrderCloud(selectedOrder.stableId);
      showToast(copy.actionSuccess, "success");
    } catch (error) {
      console.error("Failed to send cloud print request:", error);
      showToast(copy.advanceFailed, "error");
    }
  }, [copy.actionSuccess, copy.advanceFailed, selectedOrder, showToast]);

  const advanceLabel = useMemo(() => {
    if (!selectedOrder) return copy.advanceStatus;
    const nextStatus = NEXT_STATUS[selectedOrder.status];
    if (!nextStatus) return copy.advanceTerminal;
    return `→ ${copy.status[nextStatus]}`;
  }, [copy, selectedOrder]);

  return (
    <main className="min-h-screen bg-slate-900 text-slate-50">
      {toast && (
        <div className="fixed inset-x-0 top-6 z-50 flex justify-center px-4">
          <div
            className={`rounded-full border px-4 py-2 text-sm font-medium shadow-lg ${
              toast.tone === "success"
                ? "border-emerald-400/60 bg-emerald-500/90 text-slate-900"
                : "border-rose-400/60 bg-rose-500/90 text-white"
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
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
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{copy.filtersTitle}</h2>
                <button
                  type="button"
                  onClick={handleResetOrderFilters}
                  disabled={!filtersDirty}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                    filtersDirty
                      ? "border-slate-600 bg-slate-900/40 text-slate-200 hover:border-slate-400 hover:text-white"
                      : "cursor-not-allowed border-slate-700 bg-slate-900/30 text-slate-500"
                  }`}
                >
                  {copy.filtersReset}
                </button>
              </div>
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
                key={`${order.stableId}-${order.createdAt}`}
                type="button"
                onClick={() => {
                  setSelectedId(order.stableId);
                  setSelectedAction("retender");
                  setReason("");
                  setSelectedItemIds([]);
                  setSwapSelection(null);
                  setSwapActiveItem(null);
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition hover:border-slate-400 hover:bg-slate-800/70 ${
                  order.stableId === selectedId
                    ? "border-emerald-400/70 bg-emerald-500/10"
                    : "border-slate-700 bg-slate-900/40"
                }`}
              >
                <div>
                <div className="text-sm font-semibold">
                  {order.clientRequestId ?? order.stableId}
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
                    {copy.orderNumberLabel}
                  </div>
                  <div className="text-2xl font-semibold">
                    {selectedOrder.clientRequestId ?? selectedOrder.stableId}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {copy.stableIdLabel}: {selectedOrder.stableId}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Link
                    href={`/${locale}/order/${selectedOrder.stableId}?source=pos`}
                    className="rounded-md border border-slate-500 bg-slate-900/40 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800/60"
                  >
                    {copy.orderDetailAction}
                  </Link>
                  <button
                    type="button"
                    onClick={handlePrintReceipt}
                    className="rounded-md border border-slate-500 bg-slate-900/40 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800/60"
                  >
                    {copy.printReceiptAction}
                  </button>
                  <button
                    type="button"
                    onClick={handleAdvanceStatus}
                    disabled={
                      isAdvancing ||
                      NEXT_STATUS[selectedOrder.status] === null
                    }
                    className={`rounded-md border px-4 py-2 text-sm font-semibold transition ${
                      isAdvancing ||
                      NEXT_STATUS[selectedOrder.status] === null
                        ? "cursor-not-allowed border-slate-700 bg-slate-900/60 text-slate-500"
                        : "border-slate-500 bg-slate-900/40 text-slate-100 hover:bg-slate-800/60"
                    }`}
                  >
                    {isAdvancing ? copy.advanceProcessing : advanceLabel}
                  </button>
                </div>
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
                summary={summary}
                selectedPaymentMethod={selectedPaymentMethod}
                onPaymentMethodChange={setSelectedPaymentMethod}
                shouldShowPaymentMethodPicker={shouldShowPaymentMethodPicker}
                canSubmit={canSubmit}
                onSubmit={handleSubmit}
                isSubmitting={isSubmitting}
                isActionDisabled={isActionDisabled}
                swapSelection={swapSelection}
                onSwapChoose={() => setIsSwapPickerOpen(true)}
                onSwapClear={() => setSwapSelection(null)}
              />
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-6 text-center text-xs text-slate-400">
              {copy.emptySelection}
            </div>
          )}
        </div>
      </section>

      {isSwapPickerOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-4xl rounded-3xl border border-slate-700 bg-slate-900 p-6 text-slate-100">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold">
                  {copy.swapItemDialogTitle}
                </h3>
                <p className="text-sm text-slate-300">
                  {copy.swapItemDialogSubtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSwapPickerOpen(false)}
                className="rounded-full border border-slate-600 px-3 py-1 text-xs text-slate-200 hover:border-slate-400"
              >
                {copy.close ?? "Close"}
              </button>
            </div>

            <div className="mt-4 max-h-[60vh] overflow-auto pr-1 space-y-4">
              {menuCategories.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-center text-sm text-slate-400">
                  {locale === "zh" ? "暂无菜单数据。" : "No menu data."}
                </div>
              ) : (
                menuCategories.map((category) => (
                  <div key={category.stableId} className="space-y-3">
                    <div className="text-sm font-semibold text-slate-200">
                      {category.name}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {category.items.map((item) => (
                        <button
                          key={item.stableId}
                          type="button"
                          onClick={() => selectSwapItem(item)}
                          className="rounded-2xl border border-slate-700 bg-slate-800/60 px-4 py-3 text-left text-sm text-slate-100 hover:border-emerald-400/60"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold">{item.name}</span>
                            <span className="text-xs text-slate-300">
                              {formatMoney(Math.round(item.price * 100))}
                            </span>
                          </div>
                          {item.optionGroups && item.optionGroups.length > 0 ? (
                            <div className="mt-1 text-[11px] text-slate-400">
                              {locale === "zh"
                                ? "含可选项"
                                : "Has options"}
                            </div>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {swapActiveItem && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-900 p-6 text-slate-100">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold">
                  {copy.swapItemDialogTitle}
                </h3>
                <p className="text-sm text-slate-300">
                  {copy.swapItemDialogSubtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSwapActiveItem(null)}
                className="rounded-full border border-slate-600 px-3 py-1 text-xs text-slate-200 hover:border-slate-400"
              >
                {copy.close ?? "Close"}
              </button>
            </div>

            <div className="mt-4 space-y-4 max-h-[60vh] overflow-auto pr-1">
              {swapOptionGroups.map((group) => {
                const groupName =
                  locale === "zh" && group.template.nameZh
                    ? group.template.nameZh
                    : group.template.nameEn;
                const selection =
                  swapActiveItem.options[group.templateGroupStableId] ?? [];
                const minSelect = group.minSelect ?? 0;
                const maxSelect = group.maxSelect ?? null;

                return (
                  <div
                    key={group.templateGroupStableId}
                    className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-base font-semibold">
                          {groupName}
                        </div>
                        <div className="text-xs text-slate-400">
                          {copy.optionLimit(minSelect, maxSelect)}
                        </div>
                      </div>
                      {minSelect > 0 && selection.length < minSelect && (
                        <span className="rounded-full border border-rose-400/70 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-200">
                          {copy.optionsRequired}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {group.options.map((option) => {
                        const selected = selection.includes(
                          option.optionStableId,
                        );
                        const optionName =
                          locale === "zh" && option.nameZh
                            ? option.nameZh
                            : option.nameEn;
                        const priceDeltaLabel =
                          option.priceDeltaCents > 0
                            ? `+${formatMoney(option.priceDeltaCents)}`
                            : option.priceDeltaCents < 0
                              ? `-${formatMoney(Math.abs(option.priceDeltaCents))}`
                              : "";
                        return (
                          <button
                            key={option.optionStableId}
                            type="button"
                            onClick={() =>
                              updateSwapOptionSelection(
                                group.templateGroupStableId,
                                option.optionStableId,
                                maxSelect,
                              )
                            }
                            className={`rounded-2xl border px-3 py-3 text-left text-sm transition ${
                              selected
                                ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                                : "border-slate-600 bg-slate-900 text-slate-200 hover:border-slate-400"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span>{optionName}</span>
                              {priceDeltaLabel && (
                                <span className="text-xs text-slate-300">
                                  {priceDeltaLabel}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {swapRequiredGroupsMissing.length > 0 && (
              <div className="mt-4 rounded-2xl border border-rose-400/70 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {copy.optionsRequired}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-300">
                  {copy.swapItemQty}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSwapActiveItem((prev) =>
                        prev
                          ? {
                              ...prev,
                              quantity: Math.max(1, prev.quantity - 1),
                            }
                          : prev,
                      )
                    }
                    className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-lg leading-none"
                  >
                    −
                  </button>
                  <span className="min-w-[2ch] text-center text-base font-semibold">
                    {swapActiveItem.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSwapActiveItem((prev) =>
                        prev
                          ? { ...prev, quantity: prev.quantity + 1 }
                          : prev,
                      )
                    }
                    className="w-8 h-8 rounded-full bg-emerald-500 text-slate-900 flex items-center justify-center text-lg leading-none"
                  >
                    +
                  </button>
                </div>
              </div>
              <button
                type="button"
                disabled={!canConfirmSwapSelection}
                onClick={confirmSwapSelection}
                className={`h-11 rounded-2xl px-6 text-sm font-semibold ${
                  canConfirmSwapSelection
                    ? "bg-emerald-500 text-slate-900 hover:bg-emerald-400"
                    : "bg-slate-700 text-slate-400"
                }`}
              >
                {copy.swapItemConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
