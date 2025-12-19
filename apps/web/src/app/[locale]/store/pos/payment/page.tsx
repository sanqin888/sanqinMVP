// apps/web/src/app/[locale]/store/pos/payment/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import type { Locale } from "@/lib/order/shared";
import { apiFetch } from "@/lib/api-client";
import {
  POS_DISPLAY_STORAGE_KEY,
  type PosDisplaySnapshot,
} from "@/lib/pos-display";

type FulfillmentType = "pickup" | "dine_in";
type PaymentMethod = "cash" | "card" | "wechat_alipay";

type CreatePosOrderResponse = {
  id: string;
  clientRequestId?: string | null;
  pickupCode?: string | null;
};

type PosPrintRequest = {
  locale: Locale;
  orderNumber: string;
  pickupCode?: string | null;
  fulfillment: FulfillmentType;
  paymentMethod: PaymentMethod;
  snapshot: PosDisplaySnapshot;
};

/**
 * 把当前订单的信息发给本地打印服务
 * 本地服务地址： http://127.0.0.1:19191/print-pos
 */
function sendPosPrintRequest(payload: PosPrintRequest): Promise<void> {
  return fetch("http://127.0.0.1:19191/print-pos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),

    // ✅ 可选：避免你点“完成/跳转”太快导致请求被浏览器取消
    keepalive: true,
  })
    .then(() => undefined)
    .catch((err) => {
      console.error("Failed to send POS print request:", err);
    });
}

const STRINGS: Record<
  Locale,
  {
    title: string;
    subtitle: string;
    orderSummary: string;
    subtotal: string;
    tax: string;
    total: string;
    fulfillmentLabel: string;
    pickup: string;
    dineIn: string;
    paymentLabel: string;
    payCash: string;
    payCard: string;
    payWeChatAlipay: string;
    back: string;
    confirm: string;
    confirming: string;
    tip: string;
    noOrder: string;
    loading: string;
    errorGeneric: string;
    successTitle: string;
    successBody: string;
    close: string;
    orderLabel: string;
    pickupCodeLabel: string;
  }
> = {
  zh: {
    title: "门店收银 · 支付方式",
    subtitle: "选择用餐方式和付款方式，然后在收银机上完成支付。",
    orderSummary: "订单信息",
    subtotal: "小计",
    tax: "税费 (HST)",
    total: "合计",
    fulfillmentLabel: "用餐方式",
    pickup: "外带",
    dineIn: "堂食",
    paymentLabel: "付款方式",
    payCash: "现金",
    payCard: "银行卡",
    payWeChatAlipay: "微信或支付宝",
    back: "返回点单",
    confirm: "确认收款并生成订单",
    confirming: "处理中…",
    tip: "请在确认顾客完成支付后，再点击“确认收款并生成订单”。",
    noOrder: "当前没有待支付的订单，请先在 POS 界面选菜下单。",
    loading: "正在读取订单信息…",
    errorGeneric: "下单失败，请稍后重试。",
    successTitle: "订单已创建",
    successBody: "单号与取餐码可在厨房看板 / POS 副屏上查看。",
    close: "完成",
    orderLabel: "订单号：",
    pickupCodeLabel: "取餐码：",
  },
  en: {
    title: "Store POS · Payment",
    subtitle: "Choose dining and payment method, then take payment on terminal.",
    orderSummary: "Order summary",
    subtotal: "Subtotal",
    tax: "Tax (HST)",
    total: "Total",
    fulfillmentLabel: "Dining",
    pickup: "Pickup",
    dineIn: "Dine-in",
    paymentLabel: "Payment method",
    payCash: "Cash",
    payCard: "Card",
    payWeChatAlipay: "WeChat / Alipay",
    back: "Back to POS",
    confirm: "Confirm payment & create order",
    confirming: "Saving…",
    tip: "Only tap “Confirm payment & create order” after the customer has finished paying.",
    noOrder: "No pending order. Please build an order on the POS screen first.",
    loading: "Loading order…",
    errorGeneric: "Failed to create order. Please try again.",
    successTitle: "Order created",
    successBody:
      "Order number and pickup code are visible on the kitchen screen / customer display.",
    close: "Done",
    orderLabel: "Order:",
    pickupCodeLabel: "Pickup code:",
  },
};

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function makePosClientRequestId(): string {
  // 在现代浏览器里：crypto.randomUUID() 基本不会重复
  // fallback：Date.now()（必要时可再拼上 Math.random()）
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `POS-${crypto.randomUUID()}`;
    }
  } catch {
    // ignore
  }
  return `POS-${Date.now()}`;
}

export default function StorePosPaymentPage() {
  const router = useRouter();
  const params = useParams<{ locale?: string }>();
  const locale = (params?.locale === "en" ? "en" : "zh") as Locale;
  const t = STRINGS[locale];

  const [snapshot, setSnapshot] = useState<PosDisplaySnapshot | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(true);
  const [fulfillment, setFulfillment] = useState<FulfillmentType>("pickup");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [submitting, setSubmitting] = useState(false);
  const [posClientRequestId, setPosClientRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    orderNumber: string;
    pickupCode?: string | null;
  } | null>(null);

  // 从 localStorage 读取 POS 界面保存的订单快照
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(POS_DISPLAY_STORAGE_KEY);
      if (!raw) {
        setSnapshot(null);
      } else {
        const parsed = JSON.parse(raw) as PosDisplaySnapshot;
        setSnapshot(parsed);
      }
    } catch (err) {
      console.error("Failed to read POS display snapshot:", err);
      setSnapshot(null);
    } finally {
      setLoadingSnapshot(false);
    }
  }, []);

  const hasItems =
    !!snapshot && Array.isArray(snapshot.items) && snapshot.items.length > 0;

  const handleBack = () => {
    router.push(`/${locale}/store/pos`);
  };

  const handleConfirm = async () => {
    const clientRequestId = posClientRequestId ?? makePosClientRequestId();
    if (!posClientRequestId) setPosClientRequestId(clientRequestId);

    setError(null);
    setSubmitting(true);

    if (!snapshot || snapshot.items.length === 0) {
      setError(t.noOrder);
      setSubmitting(false);
      return;
    }

    try {
      const itemsPayload = snapshot.items.map((item) => ({
        productStableId: item.stableId,
        qty: item.quantity,
        // 后端单价通常用“元”还是“分”你之前已经定过了，
        // 这里我按你 web 那套：API 用“元”，DB 存“分”，所以 /100
        unitPrice: item.unitPriceCents / 100,
        displayName: locale === "zh" ? item.nameZh : item.nameEn,
        nameEn: item.nameEn,
        nameZh: item.nameZh,
        options: item.options,
      }));

      const body = {
        channel: "in_store" as const,
        fulfillmentType: fulfillment,
        subtotalCents: snapshot.subtotalCents,
        taxCents: snapshot.taxCents,
        totalCents: snapshot.totalCents,
        paymentMethod,
        items: itemsPayload,

        // ✅ 更可靠的幂等 key / 请求追踪 id
        clientRequestId,
      };

      // 👉 调试用：你可以先打开这一行看看真实发出去是什么
      // console.log("POS create order body:", body);

      const order = await apiFetch<CreatePosOrderResponse>("/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const orderNumber = order.clientRequestId ?? clientRequestId;
      const pickupCode = order.pickupCode ?? null;

      // ✅ 打印：发送给本地打印服务（无弹窗）
      if (typeof window !== "undefined") {
        void sendPosPrintRequest({
          locale,
          orderNumber,
          pickupCode,
          fulfillment,
          paymentMethod,
          snapshot,
        });

        try {
          window.localStorage.removeItem(POS_DISPLAY_STORAGE_KEY);
        } catch {
          // ignore
        }
      }

      setSuccessInfo({
        orderNumber,
        pickupCode,
      });
    } catch (err) {
      console.error("Failed to place POS order:", err);
      setError(err instanceof Error ? err.message : t.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseSuccess = () => {
    setSuccessInfo(null);
    router.push(`/${locale}/store/pos`);
  };

  return (
    <main className="min-h-screen bg-slate-900 text-slate-50">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
        <div>
          <h1 className="text-2xl font-semibold">{t.title}</h1>
          <p className="text-sm text-slate-300">{t.subtitle}</p>
        </div>
        {/* 右上角全站语言切换由根布局提供，这里不再重复 */}
      </header>

      <section className="p-4 max-w-5xl mx-auto flex flex-col gap-4 lg:flex-row">
        {/* 左侧：订单信息 */}
        <div className="flex-1 rounded-3xl bg-slate-800/80 border border-slate-700 p-4">
          <h2 className="text-sm font-semibold mb-3">{t.orderSummary}</h2>

          {loadingSnapshot ? (
            <p className="text-sm text-slate-400">{t.loading}</p>
          ) : !hasItems || !snapshot ? (
            <div className="space-y-3 text-sm text-slate-400">
              <p>{t.noOrder}</p>
              <button
                type="button"
                onClick={handleBack}
                className="mt-1 inline-flex h-9 items-center justify-center rounded-2xl border border-slate-600 px-3 text-xs font-medium text-slate-100 hover:bg-slate-700"
              >
                {t.back}
              </button>
            </div>
          ) : (
            <>
              <ul className="space-y-2 max-h-72 overflow-auto pr-1">
                {snapshot.items.map((item) => (
                  <li
                    key={
                      item.lineId ??
                      `${item.stableId}-${item.unitPriceCents}-${item.quantity}`
                    }
                    className="rounded-2xl bg-slate-900/60 px-3 py-2 flex items-center justify-between gap-2"
                  >
                    <div className="flex-1">
                      <div className="text-sm font-medium">
                        {locale === "zh" ? item.nameZh : item.nameEn}
                      </div>
                      <div className="text-xs text-slate-400">
                        ×{item.quantity}
                      </div>
                    </div>
                    <div className="text-sm font-semibold">
                      {formatMoney(item.lineTotalCents)}
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-4 border-t border-slate-700 pt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-300">{t.subtotal}</span>
                  <span>{formatMoney(snapshot.subtotalCents)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-300">{t.tax}</span>
                  <span>{formatMoney(snapshot.taxCents)}</span>
                </div>
                <div className="flex justify-between text-base font-semibold">
                  <span>{t.total}</span>
                  <span>{formatMoney(snapshot.totalCents)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 右侧：用餐方式 + 付款方式 */}
        <div className="w-full lg:w-80 flex flex-col rounded-3xl bg-slate-800/80 border border-slate-700 p-4">
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold mb-2">
                {t.fulfillmentLabel}
              </h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => setFulfillment("pickup")}
                  className={`h-10 rounded-2xl border font-medium ${
                    fulfillment === "pickup"
                      ? "border-emerald-400 bg-emerald-500 text-slate-900"
                      : "border-slate-600 bg-slate-900 text-slate-100"
                  }`}
                >
                  {t.pickup}
                </button>
                <button
                  type="button"
                  onClick={() => setFulfillment("dine_in")}
                  className={`h-10 rounded-2xl border font-medium ${
                    fulfillment === "dine_in"
                      ? "border-emerald-400 bg-emerald-500 text-slate-900"
                      : "border-slate-600 bg-slate-900 text-slate-100"
                  }`}
                >
                  {t.dineIn}
                </button>
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold mb-2">
                {t.paymentLabel}
              </h2>
              <div className="grid grid-cols-1 gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("cash")}
                  className={`h-10 rounded-2xl border font-medium ${
                    paymentMethod === "cash"
                      ? "border-emerald-400 bg-emerald-500 text-slate-900"
                      : "border-slate-600 bg-slate-900 text-slate-100"
                  }`}
                >
                  {t.payCash}
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("card")}
                  className={`h-10 rounded-2xl border font-medium ${
                    paymentMethod === "card"
                      ? "border-emerald-400 bg-emerald-500 text-slate-900"
                      : "border-slate-600 bg-slate-900 text-slate-100"
                  }`}
                >
                  {t.payCard}
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("wechat_alipay")}
                  className={`h-10 rounded-2xl border font-medium ${
                    paymentMethod === "wechat_alipay"
                      ? "border-emerald-400 bg-emerald-500 text-slate-900"
                      : "border-slate-600 bg-slate-900 text-slate-100"
                  }`}
                >
                  {t.payWeChatAlipay}
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-400">{t.tip}</p>

            {error && (
              <div className="rounded-2xl border border-rose-500/60 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                {error}
              </div>
            )}
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="flex-1 h-11 rounded-2xl border border-slate-600 text-sm font-medium text-slate-100 hover:bg-slate-700"
            >
              {t.back}
            </button>
            <button
              type="button"
              disabled={!hasItems || submitting || !snapshot}
              onClick={handleConfirm}
              className={`flex-[1.5] h-11 rounded-2xl text-sm font-semibold ${
                !hasItems || submitting || !snapshot
                  ? "bg-slate-500 text-slate-200"
                  : "bg-emerald-500 text-slate-900 hover:bg-emerald-400"
              }`}
            >
              {submitting ? t.confirming : t.confirm}
            </button>
          </div>
        </div>
      </section>

      {/* 成功弹窗 */}
      {successInfo && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-700 p-6 text-center">
            <h3 className="text-lg font-semibold mb-2">
              {t.successTitle}
            </h3>
            <p className="text-sm text-slate-300 mb-3">
              {t.successBody}
            </p>
            <div className="mb-4 space-y-1 text-sm">
              <div>
                {t.orderLabel}{" "}
                <span className="font-mono font-semibold">
                  {successInfo.orderNumber}
                </span>
              </div>
              {successInfo.pickupCode && (
                <div>
                  {t.pickupCodeLabel}{" "}
                  <span className="font-mono font-bold text-2xl">
                    {successInfo.pickupCode}
                  </span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleCloseSuccess}
              className="mt-2 inline-flex items-center justify-center px-4 py-2 rounded-2xl bg-slate-100 text-slate-900 text-sm font-medium hover:bg-white"
            >
              {t.close}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
