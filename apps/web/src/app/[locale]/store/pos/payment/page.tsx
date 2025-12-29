// apps/web/src/app/[locale]/store/pos/payment/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { TAX_RATE, type Locale } from "@/lib/order/shared";
import { ApiError, apiFetch, advanceOrder } from "@/lib/api-client";
import {
  POS_DISPLAY_CHANNEL,
  POS_DISPLAY_STORAGE_KEY,
  type PosDisplaySnapshot,
} from "@/lib/pos-display";

type FulfillmentType = "pickup" | "dine_in";
type PaymentMethod = "cash" | "card" | "wechat_alipay";

type CreatePosOrderResponse = {
  orderStableId: string;
  orderNumber: string;
  pickupCode?: string | null;
};

type MemberLookupResponse = {
  userId: string;
  userStableId: string;
  displayName?: string | null;
  phone?: string | null;
  tier: "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";
  points: number;
  availableDiscountCents: number;
  lifetimeSpendCents: number;
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
    discount: string;
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
    discountLabel: string;
    discountButton: string;
    discountNone: string;
    memberLabel: string;
    memberPhone: string;
    memberLookup: string;
    memberClear: string;
    memberPoints: string;
    memberPointsAvailable: string;
    memberRedeemLabel: string;
    memberRedeemHint: string;
    memberFound: string;
    memberNotFound: string;
    memberLoading: string;
    memberEarned: string;
    memberBalanceAfter: string;
    fulfillmentRequired: string;
  }
> = {
  zh: {
    title: "门店收银 · 支付方式",
    subtitle: "选择用餐方式和付款方式，然后在收银机上完成支付。",
    orderSummary: "订单信息",
    subtotal: "小计",
    discount: "折扣",
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
    discountLabel: "折扣选项",
    discountButton: "选择折扣",
    discountNone: "不使用折扣",
    memberLabel: "会员手机号",
    memberPhone: "输入会员手机号",
    memberLookup: "确认会员",
    memberClear: "清除会员",
    memberPoints: "当前积分",
    memberPointsAvailable: "可抵扣金额",
    memberRedeemLabel: "本单使用积分",
    memberRedeemHint: "输入整数积分",
    memberFound: "已识别会员",
    memberNotFound: "未找到会员，请核对手机号",
    memberLoading: "正在查询会员…",
    memberEarned: "本单预计新增积分",
    memberBalanceAfter: "预计结算后积分",
    fulfillmentRequired: "请选择用餐方式后再继续。",
  },
  en: {
    title: "Store POS · Payment",
    subtitle: "Choose dining and payment method, then take payment on terminal.",
    orderSummary: "Order summary",
    subtotal: "Subtotal",
    discount: "Discount",
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
    discountLabel: "Discount",
    discountButton: "Select discount",
    discountNone: "No discount",
    memberLabel: "Member phone",
    memberPhone: "Enter member phone",
    memberLookup: "Confirm member",
    memberClear: "Clear member",
    memberPoints: "Current points",
    memberPointsAvailable: "Available discount",
    memberRedeemLabel: "Redeem points",
    memberRedeemHint: "Enter whole points",
    memberFound: "Member confirmed",
    memberNotFound: "Member not found. Please check the phone.",
    memberLoading: "Looking up member…",
    memberEarned: "Estimated points earned",
    memberBalanceAfter: "Estimated balance after",
    fulfillmentRequired: "Select a dining option before continuing.",
  },
};

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function StorePosPaymentPage() {
  const router = useRouter();
  const params = useParams<{ locale?: string }>();
  const locale = (params?.locale === "en" ? "en" : "zh") as Locale;
  const t = STRINGS[locale];

  const [snapshot, setSnapshot] = useState<PosDisplaySnapshot | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(true);
  const [fulfillment, setFulfillment] = useState<FulfillmentType | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [discountRate, setDiscountRate] = useState<number>(0);
  const [showDiscountOptions, setShowDiscountOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberPhone, setMemberPhone] = useState("");
  const [memberInfo, setMemberInfo] = useState<MemberLookupResponse | null>(
    null,
  );
  const [memberLookupLoading, setMemberLookupLoading] = useState(false);
  const [memberLookupError, setMemberLookupError] = useState<string | null>(
    null,
  );
  const [redeemPointsInput, setRedeemPointsInput] = useState("");
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

  const baseSubtotalCents = useMemo(() => {
    if (!snapshot?.items?.length) return 0;
    return snapshot.items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  }, [snapshot]);

  const discountCents = useMemo(
    () => Math.round(baseSubtotalCents * discountRate),
    [baseSubtotalCents, discountRate],
  );

  const discountedSubtotalCents = Math.max(0, baseSubtotalCents - discountCents);

  const maxRedeemableCentsForOrder = useMemo(() => {
    if (!memberInfo) return 0;
    if (discountedSubtotalCents <= 0) return 0;
    return Math.min(
      memberInfo.availableDiscountCents,
      discountedSubtotalCents,
    );
  }, [discountedSubtotalCents, memberInfo]);

  const maxRedeemablePointsForOrder = useMemo(() => {
    if (!memberInfo) return 0;
    return Math.floor(maxRedeemableCentsForOrder / 100);
  }, [maxRedeemableCentsForOrder, memberInfo]);

  const pointsToRedeem = useMemo(() => {
    if (!memberInfo) return 0;
    if (!redeemPointsInput) return 0;
    const normalized = redeemPointsInput.replace(/[^\d]/g, "");
    const requested = Number.parseInt(normalized, 10);
    if (!Number.isFinite(requested) || requested <= 0) return 0;
    return Math.min(requested, maxRedeemablePointsForOrder);
  }, [memberInfo, maxRedeemablePointsForOrder, redeemPointsInput]);

  const loyaltyRedeemCents = pointsToRedeem * 100;

  const effectiveSubtotalCents = Math.max(
    0,
    discountedSubtotalCents - loyaltyRedeemCents,
  );
  const taxCents = Math.round(effectiveSubtotalCents * TAX_RATE);
  const totalCents = effectiveSubtotalCents + taxCents;

  const pointsEarned = useMemo(() => {
    if (!memberInfo) return 0;
    const tierMultiplier = {
      BRONZE: 1,
      SILVER: 2,
      GOLD: 3,
      PLATINUM: 5,
    } as const;
    const earnRate = 0.01;
    const base = (effectiveSubtotalCents / 100) * earnRate;
    const earned = base * tierMultiplier[memberInfo.tier];
    return Math.round(earned * 100) / 100;
  }, [effectiveSubtotalCents, memberInfo]);

  const computedSnapshot = useMemo(() => {
    if (!snapshot) return null;
    return {
      ...snapshot,
      subtotalCents: discountedSubtotalCents,
      discountCents,
      taxCents,
      totalCents,
      loyalty: memberInfo
        ? {
            userStableId: memberInfo.userStableId ?? null,
            pointsBalance: memberInfo.points,
            pointsRedeemed: pointsToRedeem,
            pointsEarned,
            pointsBalanceAfter:
              Math.round(
                (memberInfo.points - pointsToRedeem + pointsEarned) * 100,
              ) / 100,
          }
        : undefined,
    } satisfies PosDisplaySnapshot;
  }, [
    discountCents,
    discountedSubtotalCents,
    memberInfo,
    pointsEarned,
    pointsToRedeem,
    snapshot,
    taxCents,
    totalCents,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!computedSnapshot?.items.length) return;

    try {
      window.localStorage.setItem(
        POS_DISPLAY_STORAGE_KEY,
        JSON.stringify(computedSnapshot),
      );
    } catch (err) {
      console.warn("Failed to write POS display snapshot:", err);
    }

    try {
      if ("BroadcastChannel" in window) {
        const channel = new BroadcastChannel(POS_DISPLAY_CHANNEL);
        channel.postMessage({ type: "snapshot", snapshot: computedSnapshot });
        channel.close();
      }
    } catch {
      // ignore
    }
  }, [computedSnapshot]);

  const summarySubtotalCents = computedSnapshot?.subtotalCents ?? 0;
  const summaryTaxCents = computedSnapshot?.taxCents ?? 0;
  const summaryTotalCents = computedSnapshot?.totalCents ?? 0;
  const summaryDiscountCents = computedSnapshot?.discountCents ?? 0;
  const summaryLoyaltyRedeemCents =
    computedSnapshot?.loyalty?.pointsRedeemed != null
      ? computedSnapshot.loyalty.pointsRedeemed * 100
      : 0;

  const discountOptions = [0.05, 0.1, 0.15];

  const handleMemberLookup = async () => {
    if (!memberPhone.trim()) {
      setMemberLookupError(t.memberNotFound);
      return;
    }
    setMemberLookupLoading(true);
    setMemberLookupError(null);
    try {
      const data = await apiFetch<MemberLookupResponse>(
        `/membership/lookup-by-phone?phone=${encodeURIComponent(memberPhone)}`,
      );
      setMemberInfo(data);
      setRedeemPointsInput("");
    } catch (err) {
      const apiError = err instanceof ApiError ? err : null;
      if (!apiError || apiError.status !== 404) {
        console.error("Failed to lookup member by phone:", err);
      }
      setMemberInfo(null);
      setMemberLookupError(
        apiError?.status === 404 ? t.memberNotFound : t.errorGeneric,
      );
    } finally {
      setMemberLookupLoading(false);
    }
  };

  const handleMemberClear = () => {
    setMemberInfo(null);
    setMemberPhone("");
    setRedeemPointsInput("");
    setMemberLookupError(null);
  };

  const handleBack = () => {
    router.push(`/${locale}/store/pos`);
  };

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);

    if (!snapshot || snapshot.items.length === 0 || !computedSnapshot) {
      setError(t.noOrder);
      setSubmitting(false);
      return;
    }
    if (!fulfillment) {
      setError(t.fulfillmentRequired);
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

      const apiPaymentMethod =
        paymentMethod === "cash"
          ? "CASH"
          : paymentMethod === "card"
            ? "CARD"
            : "WECHAT_ALIPAY";

      const body = {
        channel: "in_store" as const,
        fulfillmentType: fulfillment,
        subtotalCents: computedSnapshot.subtotalCents,
        taxCents: computedSnapshot.taxCents,
        totalCents: computedSnapshot.totalCents,
        paymentMethod: apiPaymentMethod,
        items: itemsPayload,
        userId: memberInfo?.userId ?? undefined,
        pointsToRedeem: pointsToRedeem > 0 ? pointsToRedeem : undefined,
        contactPhone: memberInfo?.phone ?? undefined,
      };

      // 👉 调试用：你可以先打开这一行看看真实发出去是什么
      // console.log("POS create order body:", body);

      const order = await apiFetch<CreatePosOrderResponse>("/pos/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const orderNumber = order.orderNumber ?? order.orderStableId;
      const pickupCode = order.pickupCode ?? null;

      // ✅ 打印：发送给本地打印服务（无弹窗）
      if (typeof window !== "undefined") {
        void sendPosPrintRequest({
          locale,
          orderNumber,
          pickupCode,
          fulfillment,
          paymentMethod,
          snapshot: computedSnapshot,
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

      if (order.orderStableId) {
        try {
            await advanceOrder(order.orderStableId);
        } catch (advanceError) {
          console.warn("Failed to mark POS order as paid:", advanceError);
        }
      }
    } catch (err) {
      console.error("Failed to place POS order:", err);
      setError(err instanceof Error ? err.message : t.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseSuccess = useCallback(() => {
    setSuccessInfo(null);
    router.push(`/${locale}/store/pos`);
  }, [locale, router]);

  useEffect(() => {
    if (!successInfo) return;
    const timer = window.setTimeout(() => {
      handleCloseSuccess();
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [handleCloseSuccess, successInfo]);

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
                  <span>{formatMoney(summarySubtotalCents)}</span>
                </div>
              {summaryDiscountCents > 0 && (
                <div className="flex justify-between text-emerald-200">
                  <span className="text-slate-300">{t.discount}</span>
                  <span>-{formatMoney(summaryDiscountCents)}</span>
                </div>
              )}
              {summaryLoyaltyRedeemCents > 0 && (
                <div className="flex justify-between text-emerald-200">
                  <span className="text-slate-300">{t.memberRedeemLabel}</span>
                  <span>-{formatMoney(summaryLoyaltyRedeemCents)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-300">{t.tax}</span>
                <span>{formatMoney(summaryTaxCents)}</span>
              </div>
                <div className="flex justify-between text-base font-semibold">
                  <span>{t.total}</span>
                  <span>{formatMoney(summaryTotalCents)}</span>
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
              <h2 className="text-sm font-semibold mb-2">{t.discountLabel}</h2>
              <div className="relative">
                <button
                  type="button"
                  disabled={!hasItems}
                  onClick={() => setShowDiscountOptions((prev) => !prev)}
                  className={`h-10 w-full rounded-2xl border text-sm font-medium ${
                    !hasItems
                      ? "border-slate-600 bg-slate-900 text-slate-500"
                      : "border-slate-600 bg-slate-900 text-slate-100 hover:border-slate-400"
                  }`}
                >
                  {discountRate > 0
                    ? `${t.discountButton} (-${Math.round(discountRate * 100)}%)`
                    : t.discountButton}
                </button>
                {showDiscountOptions && (
                  <div className="absolute z-10 mt-2 w-full rounded-2xl border border-slate-600 bg-slate-900 p-2 shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setDiscountRate(0);
                        setShowDiscountOptions(false);
                      }}
                      className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
                    >
                      {t.discountNone}
                    </button>
                    {discountOptions.map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => {
                          setDiscountRate(rate);
                          setShowDiscountOptions(false);
                        }}
                        className="mt-1 w-full rounded-xl px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
                      >
                        -{Math.round(rate * 100)}%
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold mb-2">{t.memberLabel}</h2>
              <div className="space-y-2">
                <input
                  type="tel"
                  value={memberPhone}
                  onChange={(event) => setMemberPhone(event.target.value)}
                  placeholder={t.memberPhone}
                  className="h-10 w-full rounded-2xl border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 placeholder:text-slate-500"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!memberPhone.trim() || memberLookupLoading}
                    onClick={handleMemberLookup}
                    className={`flex-1 h-9 rounded-2xl border text-xs font-medium ${
                      !memberPhone.trim() || memberLookupLoading
                        ? "border-slate-700 bg-slate-900 text-slate-500"
                        : "border-slate-600 bg-slate-900 text-slate-100 hover:border-slate-400"
                    }`}
                  >
                    {memberLookupLoading ? t.memberLoading : t.memberLookup}
                  </button>
                  <button
                    type="button"
                    onClick={handleMemberClear}
                    className="h-9 rounded-2xl border border-slate-600 px-3 text-xs font-medium text-slate-100 hover:border-slate-400"
                  >
                    {t.memberClear}
                  </button>
                </div>
                {memberLookupError && (
                  <p className="text-xs text-rose-200">{memberLookupError}</p>
                )}
                {memberInfo && (
                  <div className="rounded-2xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200">
                    <p className="font-medium text-emerald-200">
                      {t.memberFound}
                    </p>
                    <p className="mt-1">
                      {t.memberPoints}: {memberInfo.points.toFixed(2)}
                    </p>
                    <p>
                      {t.memberPointsAvailable}:{" "}
                      {formatMoney(memberInfo.availableDiscountCents)}
                    </p>
                    <p className="text-slate-400">
                      ID: {memberInfo.userStableId}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {memberInfo && (
              <div>
                <h2 className="text-sm font-semibold mb-2">
                  {t.memberRedeemLabel}
                </h2>
                <div className="space-y-2">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={redeemPointsInput}
                    onChange={(event) => setRedeemPointsInput(event.target.value)}
                    placeholder={t.memberRedeemHint}
                    className="h-10 w-full rounded-2xl border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 placeholder:text-slate-500"
                  />
                  <p className="text-xs text-slate-400">
                    {t.memberRedeemHint} · Max{" "}
                    {maxRedeemablePointsForOrder}
                  </p>
                  <div className="text-xs text-slate-400">
                    {t.memberEarned}: {pointsEarned.toFixed(2)}
                  </div>
                  <div className="text-xs text-slate-400">
                    {t.memberBalanceAfter}:{" "}
                    {(
                      memberInfo.points -
                      pointsToRedeem +
                      pointsEarned
                    ).toFixed(2)}
                  </div>
                </div>
              </div>
            )}

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
              disabled={!hasItems || submitting || !snapshot || !fulfillment}
              onClick={handleConfirm}
              className={`flex-[1.5] h-11 rounded-2xl text-sm font-semibold ${
                !hasItems || submitting || !snapshot || !fulfillment
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
