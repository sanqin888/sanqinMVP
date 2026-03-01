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
  locale: Locale;
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

type CloverElementInstance = { mount: (selector: string) => void; addEventListener: (event: string, handler: (payload: unknown) => void) => void; destroy?: () => void };
type CloverTokenResult = { token?: string; errors?: Array<{ message?: string }> };
type CloverInstance = { elements: () => { create: (type: string, options?: Record<string, unknown>) => CloverElementInstance }; createToken: () => Promise<CloverTokenResult> };
type CloverConstructor = new (key?: string, options?: { merchantId?: string }) => CloverInstance;
type CardFieldKey = "name" | "number" | "date" | "cvv";

function toSafeErrorLog(error: unknown) { if (error instanceof ApiError) return { name: error.name, message: error.message, status: error.status }; if (error instanceof Error) return { name: error.name, message: error.message }; return { message: String(error) }; }
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> { return new Promise((resolve, reject) => { const id = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms); p.then((value) => { clearTimeout(id); resolve(value); }, (error) => { clearTimeout(id); reject(error); }); }); }
function getRemainingMs(expiresAtIso?: string): number { if (!expiresAtIso) return 0; const expiresAt = Date.parse(expiresAtIso); if (!Number.isFinite(expiresAt)) return 0; return Math.max(0, expiresAt - Date.now()); }
function formatRemaining(remainingMs: number): string { const t = Math.max(0, Math.ceil(remainingMs / 1000)); return `${Math.floor(t / 60).toString().padStart(2, "0")}:${(t % 60).toString().padStart(2, "0")}`; }

function buildPaymentErrorMessage(locale: Locale, error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error instanceof ApiError && error.payload && typeof error.payload === "object") {
    const payload = error.payload as Record<string, unknown>;
    const code = typeof payload.code === "string" ? payload.code : "";
    if (["AMOUNT_MISMATCH", "pricing_token_amount_mismatch", "PAYMENT_SESSION_EXPIRED"].includes(code)) {
      return locale === "zh" ? "订单金额或会话状态已变更，请返回结算页重新确认后再支付。" : "Order amount/session changed. Please return to checkout and confirm again.";
    }
    if (payload.details && typeof payload.details === "object") {
      const details = payload.details as Record<string, unknown>;
      const reason = typeof details.reason === "string" ? details.reason.trim() : "";
      if (reason) return reason;
    }
    if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  }
  return locale === "zh" ? "银行卡支付失败，请返回结算页重试。" : "Card payment failed. Please go back and try again.";
}

function extractFieldEventState(payload: unknown): { complete?: boolean; error?: string } {
  if (!payload || typeof payload !== "object") return {};
  const data = payload as Record<string, unknown>;
  const complete = typeof data.complete === "boolean" ? data.complete : typeof data.isValid === "boolean" ? data.isValid : typeof data.valid === "boolean" ? data.valid : undefined;
  const errorObj = data.error;
  const error =
    typeof data.error === "string"
      ? data.error
      : errorObj && typeof errorObj === "object" && "message" in errorObj && typeof (errorObj as Record<string, unknown>).message === "string"
        ? ((errorObj as Record<string, unknown>).message as string)
        : typeof data.message === "string"
          ? data.message
          : undefined;

  return { complete, error };
}

export default function CardPayWalletPage() {
  const params = useParams<{ locale?: string }>();
  const searchParams = useSearchParams();
  const locale = (params?.locale === "zh" ? "zh" : "en") as Locale;
  const router = useRouter();

  const [ctx, setCtx] = useState<PaymentCtx | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [postalCode, setPostalCode] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CardFieldKey, string>>>({});
  const [fieldCompletion, setFieldCompletion] = useState<Record<CardFieldKey, boolean>>({ name: false, number: false, date: false, cvv: false });
  const [remainingMs, setRemainingMs] = useState(0);
  const sessionExpired = remainingMs <= 0 && !loading && Boolean(ctx);
  const isDelivery = ctx?.metadata && typeof ctx.metadata === "object" && "fulfillment" in ctx.metadata ? ctx.metadata.fulfillment === "delivery" : false;
  const normalizedPostalCode = postalCode.replace(/\s+/g, "").toUpperCase();
  const postalCodeValid = !isDelivery || /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(normalizedPostalCode);
  const hasFieldError = Object.values(fieldErrors).some((v) => Boolean(v));
  const canSubmit = !submitting && !sessionExpired && Object.values(fieldCompletion).every(Boolean) && !hasFieldError && postalCodeValid;

  const cloverRef = useRef<CloverInstance | null>(null);
  const fieldRefs = useRef<CloverElementInstance[]>([]);

  const currencyFormatter = useMemo(() => new Intl.NumberFormat(locale === "zh" ? "zh-Hans-CA" : "en-CA", { style: "currency", currency: HOSTED_CHECKOUT_CURRENCY, minimumFractionDigits: 2, maximumFractionDigits: 2 }), [locale]);

  useEffect(() => {
    const sessionId = searchParams.get("sessionId")?.trim();
    if (!sessionId) { setError(locale === "zh" ? "缺少支付会话，请返回结算页重试。" : "Missing payment session. Please go back and try again."); setLoading(false); return; }
    let cancelled = false;
    const loadSession = async () => {
      try {
        console.debug("[CARD][session] enter", { sessionId });
        const data = await withTimeout(apiFetch<PaymentSessionFetchResponse>(`/clover/pay/online/session?sessionId=${encodeURIComponent(sessionId)}&paymentMethod=CARD`), 15000, "apiFetch /clover/pay/online/session");
        if (cancelled) return;
        setCtx({ sessionId: data.sessionId, paymentMethod: (data.paymentMethod as PaymentCtx["paymentMethod"]) ?? "CARD", locale, checkoutIntentId: data.checkoutIntentId, pricingToken: data.pricingToken, pricingTokenExpiresAt: data.pricingTokenExpiresAt, currency: data.currency || HOSTED_CHECKOUT_CURRENCY, totalCents: data.quote.totalCents, metadata: data.metadata });
        setPostalCode("");
        setRemainingMs(getRemainingMs(data.pricingTokenExpiresAt));
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error("[CARD][session] load error", toSafeErrorLog(err));
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
    if (!publicKey || !merchantId) { setError(locale === "zh" ? "支付初始化失败：缺少 Clover 配置。" : "Payment init failed: missing Clover config."); return; }

    let cancelled = false;
    const init = async () => {
      try {
        await loadScript(sdkUrl);
        if (cancelled) return;
        const Clover = (window as Window & { Clover?: CloverConstructor }).Clover;
        if (!Clover) throw new Error("Clover SDK not available");

        const nameHost = document.getElementById("clover-card-name");
        const numberHost = document.getElementById("clover-card-number");
        const dateHost = document.getElementById("clover-card-date");
        const cvvHost = document.getElementById("clover-card-cvv");
        if (!nameHost || !numberHost || !dateHost || !cvvHost) throw new Error("Card fields not ready");

        fieldRefs.current.forEach((f) => f.destroy?.());
        fieldRefs.current = [];

        const clover = new Clover(publicKey, { merchantId });
        cloverRef.current = clover;
        const name = clover.elements().create("CARD_NAME");
        const number = clover.elements().create("CARD_NUMBER");
        const date = clover.elements().create("CARD_DATE");
        const cvv = clover.elements().create("CARD_CVV");

        const bindFieldListener = (field: CloverElementInstance, key: CardFieldKey) => {
          field.addEventListener("change", (payload) => {
            const next = extractFieldEventState(payload);
            if (typeof next.complete === "boolean") {
              setFieldCompletion((prev) => ({ ...prev, [key]: next.complete ?? false }));
            }
            if (typeof next.error === "string") {
              setFieldErrors((prev) => ({ ...prev, [key]: next.error }));
            } else if (next.complete) {
              setFieldErrors((prev) => ({ ...prev, [key]: "" }));
            }
          });
        };

        bindFieldListener(name, "name");
        bindFieldListener(number, "number");
        bindFieldListener(date, "date");
        bindFieldListener(cvv, "cvv");

        name.mount("#clover-card-name");
        number.mount("#clover-card-number");
        date.mount("#clover-card-date");
        cvv.mount("#clover-card-cvv");
        fieldRefs.current = [name, number, date, cvv];

      } catch (err) {
        console.error("[CARD][session] init error", toSafeErrorLog(err));
        setError(locale === "zh" ? "银行卡支付初始化失败，请返回结算页重试。" : "Failed to initialize card payment. Please go back and try again.");
      }
    };

    void init();
    return () => {
      cancelled = true;
      fieldRefs.current.forEach((f) => f.destroy?.());
      fieldRefs.current = [];
      cloverRef.current = null;
    };
  }, [ctx, locale]);

  const handlePay = async () => {
    if (!ctx || !cloverRef.current || submitting || sessionExpired) {
      if (sessionExpired) setError(locale === "zh" ? "支付会话已过期，请返回结算页重新发起支付。" : "Payment session expired. Please go back to checkout and restart payment.");
      return;
    }
    if (!canSubmit) {
      setError(isDelivery && !postalCodeValid
        ? (locale === "zh" ? "配送订单需要填写有效邮编（如 A1A1A1）。" : "A valid postal code is required for delivery orders.")
        : (locale === "zh" ? "请先完整填写银行卡信息并修正错误后再支付。" : "Please complete card details and fix errors before paying."));
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const tokenResult = await cloverRef.current.createToken();
      if (!tokenResult?.token) throw new Error(tokenResult?.errors?.[0]?.message ?? (locale === "zh" ? "卡信息验证失败，请检查后重试。" : "Card verification failed. Please check and try again."));
      console.debug("[CARD][token] created", { sessionId: ctx.sessionId });
      const browserInfo = build3dsBrowserInfo();
      const customer = ctx.metadata && typeof ctx.metadata === "object" && "customer" in ctx.metadata ? (ctx.metadata.customer as Record<string, unknown> | undefined) : undefined;
      console.debug("[CARD][submit] start", { sessionId: ctx.sessionId, checkoutIntentId: ctx.checkoutIntentId });

      const paymentResponse = await withTimeout(apiFetch<CardTokenPaymentResponse>("/clover/pay/online/card-token", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          amountCents: ctx.totalCents,
          currency: ctx.currency || HOSTED_CHECKOUT_CURRENCY,
          pricingToken: ctx.pricingToken,
          checkoutIntentId: ctx.checkoutIntentId,
          source: tokenResult.token,
          sourceType: "CARD",
          cardholderName: typeof customer?.firstName === "string" || typeof customer?.lastName === "string" ? `${typeof customer?.firstName === "string" ? customer.firstName : ""} ${typeof customer?.lastName === "string" ? customer.lastName : ""}`.trim() || "Card Holder" : "Card Holder",
          postalCode: normalizedPostalCode || undefined,
          customer: customer ?? {}, metadata: ctx.metadata,
          threeds: { source: "CLOVER", browserInfo },
        }),
      }), 20000, "apiFetch /clover/pay/online/card-token");

      if (paymentResponse?.status === "CHALLENGE_REQUIRED" && paymentResponse.challengeUrl) {
        window.location.assign(paymentResponse.challengeUrl);
        return;
      }

      if (!paymentResponse?.orderStableId) throw new Error(locale === "zh" ? "支付处理中或失败，请返回结算页重试。" : "Payment is processing/failed. Please go back and try again.");
      router.replace(`/${locale}/thank-you/${paymentResponse.orderStableId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("timeout")) console.error("[CARD][submit-timeout]", toSafeErrorLog(err));
      else console.error("[CARD][submit-error]", toSafeErrorLog(err));
      setError(buildPaymentErrorMessage(locale, err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 py-10">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">{locale === "zh" ? "银行卡支付" : "Card payment"}</h1>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">{locale === "zh" ? "正在加载支付信息…" : "Loading payment context…"}</p>
        ) : error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
        ) : ctx ? (
          <>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              <p>{locale === "zh" ? "应付金额" : "Amount due"}</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{currencyFormatter.format(ctx.totalCents / 100).replace(/^CA\$\s?/, "$")}</p>
              <p className={`mt-2 text-xs font-semibold ${sessionExpired ? "text-rose-600" : "text-slate-600"}`}>{locale === "zh" ? "支付会话剩余时间" : "Session time left"}：{formatRemaining(remainingMs)}</p>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="space-y-1 md:col-span-1"><label className="text-xs font-medium text-slate-600">{locale === "zh" ? "持卡人姓名" : "Name on card"} *</label><div id="clover-card-name" className="flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-3" /></div>
              <div className="space-y-1 md:col-span-2"><label className="text-xs font-medium text-slate-600">{locale === "zh" ? "卡号" : "Card number"} *</label><div id="clover-card-number" className="flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-3" /></div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="space-y-1"><label className="text-xs font-medium text-slate-600">{locale === "zh" ? "有效期" : "MM/YY"} *</label><div id="clover-card-date" className="flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-3" /></div>
              <div className="space-y-1"><label className="text-xs font-medium text-slate-600">{locale === "zh" ? "安全码" : "CVV"} *</label><div id="clover-card-cvv" className="flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-3" /></div>
            </div>


            <div className="mt-3 space-y-1">
              <label className="text-xs font-medium text-slate-600">
                {locale === "zh" ? "邮编" : "Postal code"}{isDelivery ? " *" : ""}
              </label>
              <input
                value={postalCode}
                onChange={(event) => setPostalCode(event.target.value)}
                autoComplete="postal-code"
                inputMode="text"
                placeholder={locale === "zh" ? "例如 A1A 1A1" : "e.g. A1A 1A1"}
                className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none ring-emerald-200 transition focus:ring"
              />
              {isDelivery && !postalCodeValid ? (
                <p className="text-xs text-rose-600">{locale === "zh" ? "配送订单需有效加拿大邮编。" : "Delivery requires a valid Canadian postal code."}</p>
              ) : null}
            </div>

            {hasFieldError ? (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                {(fieldErrors.number || fieldErrors.date || fieldErrors.cvv || fieldErrors.name || (locale === "zh" ? "请检查银行卡信息输入是否正确。" : "Please verify your card details."))}
              </div>
            ) : null}

            {sessionExpired ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{locale === "zh" ? "支付会话已过期，请返回结算页重新发起支付。" : "Payment session expired. Please go back to checkout and restart payment."}</div> : null}

            <button type="button" className="mt-5 w-full rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-200" onClick={() => void handlePay()} disabled={!canSubmit}>
              {submitting ? (locale === "zh" ? "支付处理中…" : "Processing...") : (locale === "zh" ? "确认并支付" : "Pay now")}
            </button>
          </>
        ) : null}

        <button type="button" className="mt-4 w-full rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => router.replace(`/${locale}/checkout`)}>
          {locale === "zh" ? "返回结算页" : "Back to checkout"}
        </button>
      </div>
    </main>
  );
}
