"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api/client";
import { build3dsBrowserInfo, DEFAULT_CLOVER_SDK_URL, loadScript } from "@/lib/clover";
import type { Locale } from "@/lib/i18n/locales";
import { HOSTED_CHECKOUT_CURRENCY, type CardTokenPaymentResponse } from "@/lib/order/shared";

type PaymentCtx = {
  sessionId: string;
  paymentMethod?: "APPLE_PAY" | "GOOGLE_PAY" | "CARD";
  checkoutIntentId: string;
  pricingToken: string;
  pricingTokenExpiresAt: string;
  currency: string;
  totalCents: number;
  metadata: Record<string, unknown>;
};

type PaymentSessionFetchResponse = {
  sessionId: string;
  paymentMethod?: "APPLE_PAY" | "GOOGLE_PAY" | "CARD" | null;
  checkoutIntentId: string;
  pricingToken: string;
  pricingTokenExpiresAt: string;
  currency: string;
  quote: { totalCents: number };
  metadata: Record<string, unknown>;
};

type CloverApplePaymentRequest = { amount: number; countryCode: string; currencyCode: string };
type CloverElementInstance = { mount: (selector: string) => void; destroy?: () => void };
type CloverInstance = {
  elements: () => { create: (type: string, options?: Record<string, unknown>) => CloverElementInstance };
  createApplePaymentRequest: (request: CloverApplePaymentRequest) => CloverApplePaymentRequest;
  updateApplePaymentStatus: (status: "success" | "failed") => void;
};
type CloverConstructor = new (key?: string, options?: { merchantId?: string }) => CloverInstance;

function toSafeErrorLog(error: unknown) {
  if (error instanceof ApiError) return { name: error.name, message: error.message, status: error.status };
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { message: String(error) };
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    p.then((value) => { clearTimeout(id); resolve(value); }, (error) => { clearTimeout(id); reject(error); });
  });
}

function getRemainingMs(expiresAtIso?: string): number {
  if (!expiresAtIso) return 0;
  const expiresAt = Date.parse(expiresAtIso);
  if (!Number.isFinite(expiresAt)) return 0;
  return Math.max(0, expiresAt - Date.now());
}

function formatRemaining(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function buildPaymentErrorMessage(locale: Locale, error: unknown) {
  if (error instanceof ApiError && error.payload && typeof error.payload === "object") {
    const payload = error.payload as Record<string, unknown>;
    const code = typeof payload.code === "string" ? payload.code : "";
    if (["AMOUNT_MISMATCH", "pricing_token_amount_mismatch", "PAYMENT_SESSION_EXPIRED"].includes(code)) {
      return locale === "zh" ? "订单金额或会话状态已变更，请返回结算页重新确认后再支付。" : "Order amount/session changed. Please return to checkout and confirm again.";
    }
    if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  }
  return locale === "zh" ? "Apple Pay 支付失败，请返回结算页重试。" : "Apple Pay failed. Please go back and try again.";
}

export default function ApplePayWalletPage() {
  const params = useParams<{ locale?: string }>();
  const searchParams = useSearchParams();
  const locale = (params?.locale === "zh" ? "zh" : "en") as Locale;
  const router = useRouter();

  const [ctx, setCtx] = useState<PaymentCtx | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [remainingMs, setRemainingMs] = useState(0);
  const sessionExpired = remainingMs <= 0 && !loading && Boolean(ctx);

  const cloverRef = useRef<CloverInstance | null>(null);
  const applePayRef = useRef<CloverElementInstance | null>(null);
  const submittedTokenRef = useRef<string | null>(null);

  const currencyFormatter = useMemo(() => new Intl.NumberFormat(locale === "zh" ? "zh-Hans-CA" : "en-CA", {
    style: "currency", currency: HOSTED_CHECKOUT_CURRENCY, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }), [locale]);

  useEffect(() => {
    const sessionId = searchParams.get("sessionId")?.trim();
    if (!sessionId) {
      setError(locale === "zh" ? "缺少支付会话，请返回结算页重试。" : "Missing payment session. Please go back and try again.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const loadSession = async () => {
      try {
        console.debug("[AP][session] enter", { sessionId });
        const data = await withTimeout(apiFetch<PaymentSessionFetchResponse>(`/clover/pay/online/session?sessionId=${encodeURIComponent(sessionId)}&paymentMethod=APPLE_PAY`), 15000, "apiFetch /clover/pay/online/session");
        if (cancelled) return;
        setCtx({
          sessionId: data.sessionId,
          paymentMethod: (data.paymentMethod as PaymentCtx["paymentMethod"]) ?? "APPLE_PAY",
          checkoutIntentId: data.checkoutIntentId,
          pricingToken: data.pricingToken,
          pricingTokenExpiresAt: data.pricingTokenExpiresAt,
          currency: data.currency || HOSTED_CHECKOUT_CURRENCY,
          totalCents: data.quote.totalCents,
          metadata: data.metadata,
        });
        setRemainingMs(getRemainingMs(data.pricingTokenExpiresAt));
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error("[AP][session] load error", toSafeErrorLog(err));
        setError(buildPaymentErrorMessage(locale, err));
        setLoading(false);
      }
    };
    void loadSession();
    return () => { cancelled = true; };
  }, [locale, searchParams]);

  useEffect(() => {
    if (!ctx) return;
    const tick = () => setRemainingMs(getRemainingMs(ctx.pricingTokenExpiresAt));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [ctx]);

  useEffect(() => {
    if (!ctx) return;
    const publicKey = process.env.NEXT_PUBLIC_CLOVER_PUBLIC_TOKEN?.trim();
    const merchantId = process.env.NEXT_PUBLIC_CLOVER_MERCHANT_ID?.trim();
    const sdkUrl = process.env.NEXT_PUBLIC_CLOVER_SDK_URL?.trim() ?? DEFAULT_CLOVER_SDK_URL;
    if (!publicKey || !merchantId) {
      setError(locale === "zh" ? "支付初始化失败：缺少 Clover 配置。" : "Payment init failed: missing Clover config.");
      return;
    }

    let cancelled = false;
    const init = async () => {
      try {
        await loadScript(sdkUrl);
        if (cancelled) return;
        const Clover = (window as Window & { Clover?: CloverConstructor }).Clover;
        if (!Clover) throw new Error("Clover SDK not available");
        const host = document.getElementById("clover-apple-pay");
        if (!host) throw new Error("Apple Pay host not ready");
        applePayRef.current?.destroy?.();
        submittedTokenRef.current = null;
        const clover = new Clover(publicKey, { merchantId });
        cloverRef.current = clover;
        const appleReq = clover.createApplePaymentRequest({ amount: ctx.totalCents, countryCode: "CA", currencyCode: "CAD" });
        const applePay = clover.elements().create("PAYMENT_REQUEST_BUTTON_APPLE_PAY", { applePaymentRequest: appleReq, sessionIdentifier: merchantId });
        host.innerHTML = "";
        applePay.mount("#clover-apple-pay");
        applePayRef.current = applePay;
      } catch (err) {
        console.error("[AP][session] init error", toSafeErrorLog(err));
        setError(locale === "zh" ? "Apple Pay 初始化失败，请返回结算页重试。" : "Failed to initialize Apple Pay. Please go back and try again.");
      }
    };
    void init();

    const onPaymentMethod = async (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined;
      const token =
        (typeof detail === "object" && detail && "tokenRecieved" in detail && typeof (detail as { tokenRecieved?: { id?: unknown } }).tokenRecieved?.id === "string"
          ? (detail as { tokenRecieved: { id: string } }).tokenRecieved.id : undefined) ??
        (typeof detail === "object" && detail && "tokenReceived" in detail && typeof (detail as { tokenReceived?: { id?: unknown } }).tokenReceived?.id === "string"
          ? (detail as { tokenReceived: { id: string } }).tokenReceived.id : undefined);
      if (!token) return;
      if (sessionExpired) {
        setError(locale === "zh" ? "支付会话已过期，请返回结算页重新发起支付。" : "Payment session expired. Please go back to checkout and restart payment.");
        return;
      }
      if (submittedTokenRef.current === token) return;
      submittedTokenRef.current = token;
      console.debug("[AP][token] received", { sessionId: ctx.sessionId });
      setError(null);
      try {
        const browserInfo = build3dsBrowserInfo();
        const customer = ctx.metadata && typeof ctx.metadata === "object" && "customer" in ctx.metadata ? (ctx.metadata.customer as Record<string, unknown> | undefined) : undefined;
        console.debug("[AP][submit] start", { sessionId: ctx.sessionId, checkoutIntentId: ctx.checkoutIntentId });
        const paymentResponse = await withTimeout(apiFetch<CardTokenPaymentResponse>("/clover/pay/online/card-token", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
            amountCents: ctx.totalCents,
            currency: ctx.currency || HOSTED_CHECKOUT_CURRENCY,
            pricingToken: ctx.pricingToken,
            checkoutIntentId: ctx.checkoutIntentId,
            source: token,
            sourceType: "CARD",
            cardholderName: typeof customer?.firstName === "string" || typeof customer?.lastName === "string" ? `${typeof customer?.firstName === "string" ? customer.firstName : ""} ${typeof customer?.lastName === "string" ? customer.lastName : ""}`.trim() || "Apple Pay" : "Apple Pay",
            customer: customer ?? {}, metadata: ctx.metadata,
            threeds: { source: "CLOVER", browserInfo },
          }),
        }), 20000, "apiFetch /clover/pay/online/card-token");

        if (!paymentResponse?.orderStableId) throw new Error(locale === "zh" ? "支付处理中或失败，请返回结算页重试。" : "Payment is processing/failed. Please go back and try again.");
        cloverRef.current?.updateApplePaymentStatus("success");
        router.replace(`/${locale}/thank-you/${paymentResponse.orderStableId}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes("timeout")) {
          console.error("[AP][submit-timeout]", toSafeErrorLog(err));
        } else {
          console.error("[AP][submit-error]", toSafeErrorLog(err));
        }
        cloverRef.current?.updateApplePaymentStatus("failed");
        setError(buildPaymentErrorMessage(locale, err));
        submittedTokenRef.current = null;
      }
    };

    window.addEventListener("paymentMethod", onPaymentMethod);
    return () => {
      cancelled = true;
      window.removeEventListener("paymentMethod", onPaymentMethod);
      applePayRef.current?.destroy?.();
      applePayRef.current = null;
      cloverRef.current = null;
      submittedTokenRef.current = null;
    };
  }, [ctx, locale, router, sessionExpired]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 py-10">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">{locale === "zh" ? "Apple Pay 支付" : "Apple Pay"}</h1>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">{locale === "zh" ? "正在加载支付信息…" : "Loading payment context…"}</p>
        ) : error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
        ) : ctx ? (
          <>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              <p>{locale === "zh" ? "应付金额（已锁定）" : "Amount due (locked)"}</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{currencyFormatter.format(ctx.totalCents / 100).replace(/^CA\$\s?/, "$")}</p>
              <p className={`mt-2 text-xs font-semibold ${sessionExpired ? "text-rose-600" : "text-slate-600"}`}>
                {locale === "zh" ? "支付会话剩余时间" : "Session time left"}：{formatRemaining(remainingMs)}
              </p>
            </div>
            {sessionExpired ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                {locale === "zh" ? "支付会话已过期，请返回结算页重新发起支付。" : "Payment session expired. Please go back to checkout and restart payment."}
              </div>
            ) : (
              <div id="clover-apple-pay" className="mt-4 flex h-12 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white" />
            )}
          </>
        ) : null}

        <button type="button" className="mt-6 w-full rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => router.replace(`/${locale}/checkout`)}>
          {locale === "zh" ? "返回结算页修改订单" : "Back to checkout"}
        </button>
      </div>
    </main>
  );
}
