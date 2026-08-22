//Users/apple/sanqinMVP/apps/web/src/components/store/StoreBoardWidget.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/locales";
import { apiFetch } from "@/lib/api/client";
import {
  advanceOrder,
  cancelUberOrder,
  fetchOrderActions,
  fetchOrderAmendments,
  fetchOrderById,
  fetchOrderPrintStatus,
  printOrderCloud,
  type OrderPrintStatus,
  type PosOrderActionCapability,
  type PosOrderAmendmentHistory,
  type PosOrderManagementAction,
} from "@/lib/api/pos";
import { parseBackendDateMs } from "@/lib/time/tz";

const ALARM_LOOP_SRC = "/sounds/pos-alarm-loop.mp3";

type BoardOrderItem = {
  productStableId: string;
  qty: number;
  displayName?: string | null;
  nameEn?: string | null;
  nameZh?: string | null;
  unitPriceCents?: number | null;
  specialInstructions?: string | null;
  optionsJson?: unknown;
};

type BoardOrder = {
  orderStableId: string;
  channel: "web" | "in_store" | "ubereats";
  status: "pending" | "paid" | "making" | "ready" | "completed" | "refunded";
  fulfillmentTiming: "IMMEDIATE" | "SCHEDULED";
  subtotalCents: number;
  taxCents: number;
  deliveryFeeCents?: number | null;
  totalCents: number;
  pickupCode?: string | null;
  createdAt: string;
  items: BoardOrderItem[];
};

type DetailOrder = {
  orderStableId: string;
  orderNumber?: string | null;
  clientRequestId?: string | null;
  channel: "web" | "in_store" | "ubereats";
  status: "pending" | "paid" | "making" | "ready" | "completed" | "refunded";
  paymentMethod?: string | null;
  fulfillmentType?: "pickup" | "dine_in" | "delivery";
  pickupCode?: string | null;
  orderNotes?: string | null;
  totalCents: number;
  items: BoardOrderItem[];
};

type OptionChoiceSnapshot = {
  stableId?: string;
  nameEn?: string | null;
  nameZh?: string | null;
  displayName?: string | null;
};

type OptionGroupSnapshot = {
  nameEn?: string | null;
  nameZh?: string | null;
  displayName?: string | null;
  choices?: OptionChoiceSnapshot[];
};

const STORE_ACTION_QUERY: Partial<Record<PosOrderManagementAction, string>> = {
  SWAP_ITEM: "swap_item",
  VOID_ITEM: "void_item",
  FULL_REFUND: "full_refund",
  CHANGE_PAYMENT: "retender",
};

function formatMoney(cents: number | null | undefined): string {
  const v = (cents ?? 0) / 100;
  return `$${v.toFixed(2)}`;
}

function pickItemName(item: BoardOrderItem, locale: Locale): string {
  const trimmedDisplay = item.displayName?.trim() ?? "";
  const trimmedEn = item.nameEn?.trim() ?? "";
  const trimmedZh = item.nameZh?.trim() ?? "";
  if (locale === "zh") {
    return trimmedZh || trimmedDisplay || trimmedEn || item.productStableId;
  }
  return trimmedEn || trimmedDisplay || trimmedZh || item.productStableId;
}

function formatStatus(status: BoardOrder["status"], locale: Locale): string {
  const isZh = locale === "zh";
  switch (status) {
    case "pending":
      return isZh ? "待接单" : "Pending";
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
      return "UberEats";
    default:
      return channel;
  }
}

function speak(text: string, locale: Locale, onEnd?: () => void) {
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
    scheduledOrder: "预约单",
    pickupCodeLabel: "取餐码",
    acceptOrder: "接单",
    terminal: "终态",
    syncingUber: "同步中…",
    reprintFront: "重打前台",
    printKitchen: "后厨小票",
    printPending: "待打印",
    printCompleted: "已打印",
    printFailed: "打印失败",
    autoAccept: "自动接单",
    autoAcceptOn: "已开启",
    autoAcceptOff: "已关闭",
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
    scheduledOrder: "Scheduled",
    pickupCodeLabel: "Pickup",
    acceptOrder: "Accept",
    terminal: "Terminal",
    syncingUber: "Syncing…",
    reprintFront: "Reprint front",
    printKitchen: "Kitchen",
    printPending: "Pending print",
    printCompleted: "Printed",
    printFailed: "Print failed",
    autoAccept: "Auto accept",
    autoAcceptOn: "On",
    autoAcceptOff: "Off",
    voiceOne: "New online order.",
    voiceMany: (n: number) => `${n} new online orders.`,
  },
} as const;

const NEXT_STATUS: Record<BoardOrder["status"], BoardOrder["status"] | null> = {
  pending: "paid",
  paid: "making",
  making: "ready",
  ready: "completed",
  completed: null,
  refunded: null,
};

const PRINTED_STORAGE_KEY = "sanqin:storeBoard:processedStableIds:v2";
const AUTO_ACCEPT_STORAGE_KEY = "sanqin:storeBoard:autoAcceptEnabled:v1";
const PRINTED_TTL_MS = 12 * 60 * 60 * 1000;
type ProcessedMap = Record<string, number>;

function safeParseCreatedAtMs(createdAt: string): number {
  const ms = parseBackendDateMs(createdAt);
  return Number.isFinite(ms) ? ms : Date.now();
}

function shouldShowOnBoard(order: BoardOrder): boolean {
  return Array.isArray(order.items) && order.items.length > 0;
}

function isAutoAcceptCandidate(order: BoardOrder): boolean {
  return (
    (order.channel === "web" && order.status === "paid") ||
    (order.channel === "ubereats" &&
      (order.status === "pending" || order.status === "paid"))
  );
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
      const ts =
        typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
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

function isOptionGroupSnapshot(value: unknown): value is OptionGroupSnapshot {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionLines(value: unknown, locale: Locale): string[] {
  if (!Array.isArray(value)) return [];
  const lines: string[] = [];
  for (const rawGroup of value) {
    if (!isOptionGroupSnapshot(rawGroup)) continue;
    const groupName =
      locale === "zh"
        ? rawGroup.nameZh || rawGroup.displayName || rawGroup.nameEn
        : rawGroup.nameEn || rawGroup.displayName || rawGroup.nameZh;
    const choices = Array.isArray(rawGroup.choices) ? rawGroup.choices : [];
    const choiceNames = choices
      .map((choice) => {
        if (!choice || typeof choice !== "object" || Array.isArray(choice)) {
          return "";
        }
        return locale === "zh"
          ? choice.nameZh ||
              choice.displayName ||
              choice.nameEn ||
              choice.stableId ||
              ""
          : choice.nameEn ||
              choice.displayName ||
              choice.nameZh ||
              choice.stableId ||
              "";
      })
      .filter(Boolean);
    if (choiceNames.length > 0) {
      lines.push(
        `${groupName ? `${groupName}: ` : ""}${choiceNames.join(" / ")}`,
      );
    }
  }
  return lines;
}

function historyLabel(
  type: PosOrderAmendmentHistory["type"],
  locale: Locale,
): string {
  const zh: Record<PosOrderAmendmentHistory["type"], string> = {
    RETENDER: "支付调整/退款",
    VOID_ITEM: "退菜",
    SWAP_ITEM: "换菜",
    ADDITIONAL_CHARGE: "补收",
  };
  const en: Record<PosOrderAmendmentHistory["type"], string> = {
    RETENDER: "Payment adjustment/refund",
    VOID_ITEM: "Void item",
    SWAP_ITEM: "Swap item",
    ADDITIONAL_CHARGE: "Additional charge",
  };
  return locale === "zh" ? zh[type] : en[type];
}

function capabilityReason(
  reason: PosOrderActionCapability["reason"],
  locale: Locale,
): string | null {
  if (!reason) return null;
  const zh = {
    CLOVER_SYNC_PENDING: "待 Clover POS / 支付同步接入",
    ORDER_REFUNDED: "订单已退款",
    ORDER_NOT_SETTLED: "订单尚未完成支付",
    ORDER_STATUS_NOT_SUPPORTED: "当前订单状态不可操作",
  } as const;
  const en = {
    CLOVER_SYNC_PENDING: "Available after Clover POS/payment sync",
    ORDER_REFUNDED: "Order already refunded",
    ORDER_NOT_SETTLED: "Order is not settled yet",
    ORDER_STATUS_NOT_SUPPORTED: "Unavailable in the current order status",
  } as const;
  return locale === "zh" ? zh[reason] : en[reason];
}

function actionLabel(action: PosOrderManagementAction, locale: Locale): string {
  const zh: Record<PosOrderManagementAction, string> = {
    SWAP_ITEM: "换菜",
    VOID_ITEM: "退菜 / 部分退款",
    FULL_REFUND: "取消订单 / 全额退款",
    CHANGE_PAYMENT: "更改支付方式",
    UBER_CANCEL: "取消 Uber 订单",
  };
  const en: Record<PosOrderManagementAction, string> = {
    SWAP_ITEM: "Swap item",
    VOID_ITEM: "Void item / partial refund",
    FULL_REFUND: "Cancel / full refund",
    CHANGE_PAYMENT: "Change payment method",
    UBER_CANCEL: "Cancel Uber order",
  };
  return locale === "zh" ? zh[action] : en[action];
}

function historyItemName(
  item: PosOrderAmendmentHistory["items"][number],
  locale: Locale,
): string {
  const display = item.displayName?.trim() ?? "";
  const en = item.nameEn?.trim() ?? "";
  const zh = item.nameZh?.trim() ?? "";
  return locale === "zh"
    ? zh || display || en || item.productStableId
    : en || display || zh || item.productStableId;
}

function OrderDetailModal(props: {
  orderStableId: string | null;
  locale: Locale;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
}) {
  const { orderStableId, locale, onClose, onChanged } = props;
  const isZh = locale === "zh";
  const [order, setOrder] = useState<DetailOrder | null>(null);
  const [actions, setActions] = useState<PosOrderActionCapability[]>([]);
  const [history, setHistory] = useState<PosOrderAmendmentHistory[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orderStableId) return;
    setLoading(true);
    setMessage(null);
    try {
      const [detail, capabilities, amendments] = await Promise.all([
        fetchOrderById<DetailOrder>(orderStableId),
        fetchOrderActions(orderStableId),
        fetchOrderAmendments(orderStableId),
      ]);
      setOrder(detail);
      setActions(capabilities.actions);
      setHistory(amendments);
    } catch (error) {
      console.error("Failed to load POS order detail:", error);
      setMessage(
        isZh ? "订单详情加载失败。" : "Failed to load order details.",
      );
    } finally {
      setLoading(false);
    }
  }, [isZh, orderStableId]);

  useEffect(() => {
    if (!orderStableId) {
      setOrder(null);
      setActions([]);
      setHistory([]);
      setHistoryOpen(false);
      setMessage(null);
      return;
    }
    void load();
  }, [load, orderStableId]);

  const title = useMemo(() => {
    if (!order) return "";
    return order.channel === "ubereats"
      ? order.pickupCode || order.orderNumber || order.orderStableId
      : order.orderNumber || order.orderStableId;
  }, [order]);

  if (!orderStableId) return null;

  const openStoreAction = (action: PosOrderManagementAction) => {
    const queryAction = STORE_ACTION_QUERY[action];
    if (!queryAction || !order) return;
    const params = new URLSearchParams({
      order: order.orderStableId,
      action: queryAction,
    });
    window.location.assign(`/${locale}/store/pos/orders?${params.toString()}`);
  };

  const handleAction = async (capability: PosOrderActionCapability) => {
    if (!capability.available || !order) return;
    if (capability.action !== "UBER_CANCEL") {
      openStoreAction(capability.action);
      return;
    }

    const reason = window
      .prompt(
        isZh
          ? "请输入取消原因（必填）"
          : "Enter cancellation reason (required)",
      )
      ?.trim();
    if (!reason) return;
    const confirmed = window.confirm(
      isZh
        ? `确认向 Uber 提交取消订单 ${title}？`
        : `Submit cancellation for Uber order ${title}?`,
    );
    if (!confirmed) return;

    try {
      setActionBusy(true);
      setMessage(null);
      const result = await cancelUberOrder<DetailOrder>(
        order.orderStableId,
        reason,
      );
      setMessage(
        result.uberActionStatus === "FAILED"
          ? isZh
            ? "Uber 取消提交失败，请查看同步状态后重试。"
            : "Uber cancellation failed. Check sync status and retry."
          : isZh
            ? "Uber 取消已提交。"
            : "Uber cancellation submitted.",
      );
      await load();
      await onChanged?.();
    } catch (error) {
      console.error("Failed to cancel Uber order:", error);
      setMessage(
        isZh ? "Uber 取消失败，请稍后重试。" : "Uber cancellation failed.",
      );
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {isZh ? "订单详情" : "Order details"}
            </div>
            <div className="mt-1 text-2xl font-bold text-emerald-200">
              {title || (isZh ? "加载中…" : "Loading…")}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-600 px-3 py-1 text-sm text-slate-200 hover:border-slate-400"
          >
            {isZh ? "关闭" : "Close"}
          </button>
        </div>

        <div className="overflow-auto p-5">
          {loading && !order ? (
            <div className="py-10 text-center text-slate-400">
              {isZh ? "加载中…" : "Loading…"}
            </div>
          ) : order ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-950/40 p-4 text-sm sm:grid-cols-4">
                <div>
                  <div className="text-xs text-slate-500">
                    {isZh ? "渠道" : "Channel"}
                  </div>
                  <div className="mt-1 font-medium">{order.channel}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">
                    {isZh ? "状态" : "Status"}
                  </div>
                  <div className="mt-1 font-medium">{order.status}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">
                    {isZh ? "支付" : "Payment"}
                  </div>
                  <div className="mt-1 font-medium">
                    {order.paymentMethod ?? "-"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">
                    {isZh ? "合计" : "Total"}
                  </div>
                  <div className="mt-1 font-semibold">
                    {formatMoney(order.totalCents)}
                  </div>
                </div>
              </div>

              {order.orderNotes?.trim() && (
                <section className="rounded-2xl border border-sky-400/30 bg-sky-500/10 p-4">
                  <h3 className="text-sm font-semibold text-sky-100">
                    {isZh
                      ? "订单备注 / Order Notes"
                      : "Order Notes / 订单备注"}
                  </h3>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-sky-100">
                    {order.orderNotes}
                  </div>
                </section>
              )}

              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-300">
                  {isZh ? "菜品明细" : "Items"}
                </h3>
                <div className="space-y-2">
                  {order.items.map((item, index) => {
                    const options = optionLines(item.optionsJson, locale);
                    return (
                      <div
                        key={`${item.productStableId}:${index}`}
                        className="rounded-2xl border border-slate-800 bg-slate-950/30 p-3"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="font-semibold">
                            x{item.qty} · {pickItemName(item, locale)}
                          </div>
                          {typeof item.unitPriceCents === "number" && (
                            <div className="shrink-0 text-sm text-slate-300">
                              {formatMoney(item.unitPriceCents * item.qty)}
                            </div>
                          )}
                        </div>
                        {options.length > 0 && (
                          <div className="mt-2 space-y-1 text-sm text-slate-300">
                            {options.map((line, optionIndex) => (
                              <div key={`${line}:${optionIndex}`}>· {line}</div>
                            ))}
                          </div>
                        )}
                        {item.specialInstructions?.trim() && (
                          <div className="mt-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                            {isZh ? "备注：" : "Note: "}
                            {item.specialInstructions}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-300">
                  {isZh ? "订单操作" : "Order actions"}
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {actions.map((capability) => {
                    const reason = capabilityReason(
                      capability.reason,
                      locale,
                    );
                    return (
                      <button
                        key={capability.action}
                        type="button"
                        disabled={!capability.available || actionBusy}
                        title={reason ?? undefined}
                        onClick={() => void handleAction(capability)}
                        className={[
                          "rounded-2xl border px-4 py-3 text-left transition",
                          capability.available && !actionBusy
                            ? capability.action === "UBER_CANCEL"
                              ? "border-rose-500/60 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
                              : "border-slate-600 bg-slate-800/70 text-slate-100 hover:bg-slate-700"
                            : "cursor-not-allowed border-slate-800 bg-slate-950/30 text-slate-600",
                        ].join(" ")}
                      >
                        <div className="font-semibold">
                          {actionLabel(capability.action, locale)}
                        </div>
                        {reason && (
                          <div className="mt-1 text-xs text-slate-500">
                            {reason}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>

              {history.length > 0 && (
                <section className="border-t border-slate-800 pt-4">
                  <button
                    type="button"
                    onClick={() => setHistoryOpen((value) => !value)}
                    className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left text-sm text-slate-300 hover:bg-slate-800/50"
                  >
                    <span>
                      {isZh ? "操作记录" : "Operation history"}（
                      {history.length}）
                    </span>
                    <span>{historyOpen ? "⌃" : "⌄"}</span>
                  </button>
                  {historyOpen && (
                    <div className="mt-2 space-y-2">
                      {history.map((entry) => (
                        <div
                          key={entry.amendmentStableId}
                          className="rounded-2xl border border-slate-800 bg-slate-950/30 p-3 text-sm"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-semibold text-slate-200">
                              {historyLabel(entry.type, locale)}
                            </div>
                            <div className="text-xs text-slate-400">
                              {entry.operatorName
                                ? `${isZh ? "操作人" : "Operator"}: ${entry.operatorName}`
                                : isZh
                                  ? "系统/历史记录"
                                  : "System / legacy record"}
                            </div>
                          </div>
                          <div className="mt-1 text-slate-300">
                            {entry.reason}
                          </div>
                          {entry.items.length > 0 && (
                            <div className="mt-2 space-y-1 text-xs text-slate-400">
                              {entry.items.map((item, index) => (
                                <div
                                  key={`${entry.amendmentStableId}:${item.productStableId}:${index}`}
                                >
                                  {item.action === "VOID"
                                    ? isZh
                                      ? "取消"
                                      : "Void"
                                    : isZh
                                      ? "新增"
                                      : "Add"}
                                  ：x{item.qty} · {historyItemName(item, locale)}
                                </div>
                              ))}
                            </div>
                          )}
                          {(entry.refundCents > 0 ||
                            entry.additionalChargeCents > 0) && (
                            <div className="mt-2 flex flex-wrap gap-3 text-xs">
                              {entry.refundCents > 0 && (
                                <span className="text-rose-300">
                                  {isZh ? "退款" : "Refund"}{" "}
                                  {formatMoney(entry.refundCents)}
                                </span>
                              )}
                              {entry.additionalChargeCents > 0 && (
                                <span className="text-emerald-300">
                                  {isZh ? "补收" : "Charge"}{" "}
                                  {formatMoney(entry.additionalChargeCents)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          ) : null}

          {message && (
            <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-950/50 px-4 py-3 text-sm text-slate-200">
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function StoreBoardWidget(props: { locale: Locale }) {
  const locale = props.locale ?? "zh";
  const t = STRINGS[locale];
  const isZh = locale === "zh";
  const [printStatuses, setPrintStatuses] = useState<
    Record<string, OrderPrintStatus>
  >({});

  const query = useMemo(
    () =>
      "/pos/orders/board?status=pending,paid,making,ready&sinceMinutes=180&limit=80",
    [],
  );

  const [open, setOpen] = useState(true);
  const [orders, setOrders] = useState<BoardOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [autoAcceptEnabled, setAutoAcceptEnabled] = useState(true);
  const [syncingReadyOrders, setSyncingReadyOrders] = useState<
    Record<string, boolean>
  >({});
  const [selectedOrderStableId, setSelectedOrderStableId] = useState<
    string | null
  >(null);
  const [flash, setFlash] = useState(false);
  const [pop, setPop] = useState(false);
  const [highlightedOrders, setHighlightedOrders] = useState<
    Record<string, boolean>
  >({});

  const processedRef = useRef<ProcessedMap>({});
  const processedSetRef = useRef<Set<string>>(new Set());
  const hasBootstrappedRef = useRef(false);
  const hadPersistedRef = useRef(false);
  const inactivityTimerRef = useRef<number | null>(null);
  const boardPanelRef = useRef<HTMLDivElement | null>(null);
  const highlightTimersRef = useRef<Record<string, number>>({});
  const alarmAudioRef = useRef<HTMLAudioElement | null>(null);
  const alarmPlayingRef = useRef(false);

  const pendingAcceptCount = useMemo(
    () => orders.filter((o) => isAutoAcceptCandidate(o)).length,
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

  const scheduleAutoExpand = useCallback(() => {
    if (inactivityTimerRef.current) {
      window.clearTimeout(inactivityTimerRef.current);
    }
    inactivityTimerRef.current = window.setTimeout(() => {
      setOpen((prev) => (prev ? prev : true));
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

  useEffect(() => {
    const map = readProcessedMap();
    processedRef.current = map;
    processedSetRef.current = new Set(Object.keys(map));
    hadPersistedRef.current = Object.keys(map).length > 0;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(AUTO_ACCEPT_STORAGE_KEY);
    if (raw === "0") {
      setAutoAcceptEnabled(false);
      return;
    }
    if (raw === "1") {
      setAutoAcceptEnabled(true);
    }
  }, []);

  const handlePrintFront = useCallback(
    async (orderStableId: string) => {
      try {
        await printOrderCloud(orderStableId, {
          locale,
          targets: { customer: true, kitchen: false },
        });
      } catch (error) {
        console.error("Failed to print front receipt via cloud:", error);
      }
    },
    [locale],
  );

  const handlePrintKitchen = useCallback(
    async (orderStableId: string) => {
      try {
        await printOrderCloud(orderStableId, {
          locale,
          targets: { customer: false, kitchen: true },
        });
      } catch (error) {
        console.error("Failed to print kitchen ticket via cloud:", error);
      }
    },
    [locale],
  );

  const fetchOrdersAndProcess = useCallback(async () => {
    const data = await apiFetch<BoardOrder[]>(query);
    const visibleOrders = data
      .filter(shouldShowOnBoard)
      .sort(
        (a, b) =>
          safeParseCreatedAtMs(a.createdAt) - safeParseCreatedAtMs(b.createdAt),
      );
    setOrders(visibleOrders);
    setSyncingReadyOrders((prev) => {
      const syncingIds = Object.keys(prev);
      if (syncingIds.length === 0) return prev;
      const currentById = new Map(
        visibleOrders.map((order) => [order.orderStableId, order] as const),
      );
      const next = { ...prev };
      let changed = false;
      for (const sid of syncingIds) {
        const current = currentById.get(sid);
        if (
          !current ||
          current.channel !== "ubereats" ||
          current.status !== "making"
        ) {
          delete next[sid];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    const statuses = await Promise.all(
      visibleOrders.map(
        async (order) =>
          [
            order.orderStableId,
            await fetchOrderPrintStatus(order.orderStableId),
          ] as const,
      ),
    );
    setPrintStatuses(Object.fromEntries(statuses));

    const processedSet = processedSetRef.current;
    const processedMap = processedRef.current;

    if (!hasBootstrappedRef.current) {
      hasBootstrappedRef.current = true;

      if (!hadPersistedRef.current) {
        for (const o of visibleOrders) {
          const sid = o.orderStableId;
          processedSet.add(sid);
          if (!processedMap[sid]) {
            processedMap[sid] = safeParseCreatedAtMs(o.createdAt);
          }
        }
        writeProcessedMap(processedMap);
        return;
      }
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

    const newOnlinePaid = newOrders.filter((o) => isAutoAcceptCandidate(o));
    if (newOnlinePaid.length > 0) {
      setOpen(true);
      setFlash(true);
      setPop(true);

      const n = newOnlinePaid.length;
      stopAlarmLoop();
      speak(n === 1 ? t.voiceOne : t.voiceMany(n), locale, () => {
        void startAlarmLoop();
      });

      if (autoAcceptEnabled) {
        for (const order of newOnlinePaid) {
          try {
            await advanceOrder(order.orderStableId);
          } catch (error) {
            console.error(
              "Failed to auto-accept order:",
              order.orderStableId,
              error,
            );
          }
        }
      }
    }
  }, [
    autoAcceptEnabled,
    query,
    t,
    locale,
    markNewOrders,
    startAlarmLoop,
    stopAlarmLoop,
  ]);

  const handleAdvance = useCallback(
    async (order: BoardOrder) => {
      const orderStableId = order.orderStableId;
      const isUberReadySync =
        order.channel === "ubereats" && order.status === "making";
      if (isUberReadySync) {
        setSyncingReadyOrders((prev) => ({
          ...prev,
          [orderStableId]: true,
        }));
      }
      try {
        await advanceOrder(orderStableId);
        await fetchOrdersAndProcess();
      } catch (error) {
        if (isUberReadySync) {
          setSyncingReadyOrders((prev) => {
            const next = { ...prev };
            delete next[orderStableId];
            return next;
          });
        }
        console.error("Failed to advance order:", error);
        alert(
          isZh
            ? "推进订单状态失败，请稍后重试。"
            : "Failed to update order status.",
        );
      }
    },
    [fetchOrdersAndProcess, isZh],
  );

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
    if (pendingAcceptCount > 0) {
      void startAlarmLoop();
    } else {
      stopAlarmLoop();
    }
  }, [pendingAcceptCount, startAlarmLoop, stopAlarmLoop]);

  useEffect(() => {
    scheduleAutoExpand();

    const handleActivity = () => {
      scheduleAutoExpand();
    };

    const handlePointerDown = (event: PointerEvent) => {
      handleActivity();
      if (!open || selectedOrderStableId) return;
      const panel = boardPanelRef.current;
      const target = event.target;
      if (!panel || !(target instanceof Node)) return;
      if (!panel.contains(target)) {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("wheel", handleActivity, { passive: true });
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("touchstart", handleActivity, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("wheel", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
    };
  }, [open, scheduleAutoExpand, selectedOrderStableId]);

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

  return (
    <div className="fixed bottom-4 right-4 z-30 pointer-events-none">
      {!open && (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            scheduleAutoExpand();
          }}
          className={[
            "pointer-events-auto rounded-full border text-slate-100 px-4 py-2 shadow-lg transition",
            "bg-slate-900/90 border-slate-700 hover:bg-slate-800/90",
            flash ? "ring-2 ring-amber-400/70 shadow-amber-500/20" : "",
          ].join(" ")}
        >
          <span className="font-semibold">{t.title}</span>
          <span className="ml-2 text-slate-300 text-sm">· {activeCount}</span>

          {pendingAcceptCount > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-rose-400/60 bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-200">
              <span className="text-[10px] leading-none">●</span>
              <span>{pendingAcceptCount}</span>
            </span>
          )}
        </button>
      )}

      {open && (
        <div
          ref={boardPanelRef}
          className={[
            "pointer-events-auto w-[420px] max-w-[calc(100vw-2rem)] h-[640px] max-h-[calc(100vh-2rem)]",
            "rounded-2xl border bg-slate-900/95 shadow-2xl overflow-hidden transition-transform duration-300",
            flash
              ? "border-amber-400/70 ring-2 ring-amber-400/40"
              : "border-slate-700",
            pop ? "scale-[1.03]" : "scale-100",
          ].join(" ")}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <div className="text-base font-semibold text-slate-100">
                  {t.title}
                </div>

                {pendingAcceptCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/60 bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-200">
                    <span className="text-[10px] leading-none">●</span>
                    <span>{pendingAcceptCount}</span>
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
                role="switch"
                aria-checked={autoAcceptEnabled}
                onClick={() => {
                  const next = !autoAcceptEnabled;
                  setAutoAcceptEnabled(next);
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem(
                      AUTO_ACCEPT_STORAGE_KEY,
                      next ? "1" : "0",
                    );
                  }
                }}
                className="rounded-full border border-slate-700 bg-slate-950/40 px-2 py-1 text-xs text-slate-100 transition hover:bg-slate-800/50"
              >
                <span className="mr-2">{t.autoAccept}</span>
                <span
                  className={[
                    "relative inline-flex h-5 w-9 items-center rounded-full transition",
                    autoAcceptEnabled ? "bg-emerald-500" : "bg-slate-600",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "inline-block h-4 w-4 transform rounded-full bg-white transition",
                      autoAcceptEnabled ? "translate-x-4" : "translate-x-0.5",
                    ].join(" ")}
                  />
                </span>
                <span className="ml-2 text-slate-300">
                  {autoAcceptEnabled ? t.autoAcceptOn : t.autoAcceptOff}
                </span>
              </button>
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
              <div className="text-center text-slate-400 py-10">
                {t.noOrders}
              </div>
            )}

            {orders.map((order) => {
              const sid = order.orderStableId;
              const operatorOrderTitle =
                order.channel === "ubereats" ? order.pickupCode : sid;
              const next = NEXT_STATUS[order.status];
              const isSyncingUberReady = Boolean(syncingReadyOrders[sid]);
              const advanceLabel = isSyncingUberReady
                ? t.syncingUber
                : next
                  ? (order.channel === "ubereats" &&
                      order.status === "pending") ||
                    order.status === "paid"
                    ? t.acceptOrder
                    : formatStatus(next, locale)
                  : t.terminal;

              const isPendingUberEats =
                order.channel === "ubereats" && order.status === "pending";
              const isHighlightedChannel =
                order.channel === "web" || isPendingUberEats;
              const printStatus = printStatuses[sid];
              const targetStatuses = printStatus
                ? [printStatus.customerStatus, printStatus.kitchenStatus]
                : [];
              const hasPrintFailure = targetStatuses.includes("FAILED");
              const hasPrinted =
                targetStatuses.length > 0 &&
                targetStatuses.every(
                  (status) => status === "COMPLETED" || status === "SKIPPED",
                );
              const printLabel = hasPrintFailure
                ? t.printFailed
                : hasPrinted
                  ? t.printCompleted
                  : t.printPending;

              return (
                <div
                  key={sid}
                  onClick={() => setSelectedOrderStableId(sid)}
                  className={[
                    "cursor-pointer rounded-2xl border p-3 bg-slate-950/30 transition hover:bg-slate-900/60",
                    isHighlightedChannel
                      ? "border-amber-400/70"
                      : "border-slate-800",
                    highlightedOrders[sid]
                      ? "animate-pulse ring-2 ring-amber-400/40"
                      : "",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {operatorOrderTitle && (
                        <div className="text-2xl font-bold text-emerald-200">
                          {operatorOrderTitle}
                        </div>
                      )}

                      {order.channel !== "ubereats" && order.pickupCode && (
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
                      <div
                        className={[
                          "mt-1 text-xs font-semibold",
                          hasPrintFailure
                            ? "text-rose-300"
                            : hasPrinted
                              ? "text-emerald-300"
                              : "text-amber-300",
                        ].join(" ")}
                        title={
                          hasPrintFailure
                            ? [
                                printStatus?.customerFailureReason,
                                printStatus?.kitchenFailureReason,
                              ]
                                .filter(Boolean)
                                .join(" / ")
                            : undefined
                        }
                      >
                        {printLabel}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="flex items-center justify-end gap-1.5">
                        {order.fulfillmentTiming === "SCHEDULED" && (
                          <div className="inline-block rounded-full border border-amber-400/60 bg-amber-400/10 px-2 py-1 text-xs font-semibold text-amber-200">
                            {t.scheduledOrder}
                          </div>
                        )}
                        <div className="inline-block rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-200">
                          {formatChannel(order.channel, locale)}
                        </div>
                      </div>
                      <div className="text-slate-300 mt-2 text-sm">
                        {t.totalLabel}: {formatMoney(order.totalCents)}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-800 my-2" />

                  <ul className="space-y-1 text-sm max-h-28 overflow-auto pr-1">
                    {order.items.map((item, idx) => (
                      <li
                        key={`${sid}:${idx}`}
                        className="flex justify-between gap-2"
                      >
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
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleAdvance(order);
                      }}
                      disabled={!next || isSyncingUberReady}
                      aria-busy={isSyncingUberReady}
                      className={[
                        "rounded-md border px-3 py-2 text-sm font-semibold transition",
                        next && !isSyncingUberReady
                          ? "border-slate-600 bg-slate-950/30 text-slate-100 hover:bg-slate-800/60"
                          : "cursor-not-allowed border-slate-800 bg-slate-950/30 text-slate-600",
                      ].join(" ")}
                    >
                      {advanceLabel}
                    </button>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handlePrintFront(sid);
                        }}
                        className="rounded-full bg-slate-800 hover:bg-slate-700 px-3 py-2 text-xs text-slate-100 transition"
                      >
                        {t.reprintFront}
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handlePrintKitchen(sid);
                        }}
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

      <OrderDetailModal
        orderStableId={selectedOrderStableId}
        locale={locale}
        onClose={() => setSelectedOrderStableId(null)}
        onChanged={fetchOrdersAndProcess}
      />
    </div>
  );
}
