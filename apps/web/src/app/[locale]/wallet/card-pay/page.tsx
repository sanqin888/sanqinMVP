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
type CardFieldKey = "CARD_NAME" | "CARD_NUMBER" | "CARD_DATE" | "CARD_CVV" | "CARD_POSTAL_CODE";
type CloverEventPayload = {
  complete?: boolean;
  touched?: boolean;
  info?: string;
  error?: string | { message?: string };
  value?: string;
  [k: string]: unknown;
};
type CloverFieldChangeEvent = {
  complete?: boolean;
  touched?: boolean;
  info?: string;
  error?: string | { message?: string };
  value?: string;
  [k: string]: unknown;
};

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

function getFieldFromEvent(event: CloverEventPayload, key: CardFieldKey): CloverFieldChangeEvent {
  if (event && typeof event === "object") {
    const e = event as {
      data?: { realTimeFormState?: unknown } | undefined;
      realTimeFormState?: unknown;
      [k: string]: unknown;
    };

    const rts1 = e.data?.realTimeFormState;
    if (rts1 && typeof rts1 === "object") {
      const rec = rts1 as Record<string, unknown>;
      const v = rec[key];
      if (v && typeof v === "object") return v as CloverFieldChangeEvent;
    }

    const rts2 = e.realTimeFormState;
    if (rts2 && typeof rts2 === "object") {
      const rec = rts2 as Record<string, unknown>;
      const v = rec[key];
      if (v && typeof v === "object") return v as CloverFieldChangeEvent;
    }

    const direct = e[key];
    if (direct && typeof direct === "object") return direct as CloverFieldChangeEvent;
  }

  return event as unknown as CloverFieldChangeEvent;
}

function hasError(field?: CloverFieldChangeEvent): boolean {
  const err = field?.error;
  if (!err) return false;
  if (typeof err === "string") return err.trim().length > 0;
  if (typeof err === "object" && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    return typeof msg === "string" && msg.trim().length > 0;
  }
  return true;
}

function isFieldPayable(field?: CloverFieldChangeEvent): boolean {
  if (!field) return false;
  if (typeof field.complete === "boolean") return field.complete === true && !hasError(field);
  const info = typeof field.info === "string" ? field.info : "";
  return Boolean(field.touched) && info.trim().length === 0;
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
  const [cloverReady, setCloverReady] = useState(false);
  const [canPay, setCanPay] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CardFieldKey, string>>>({});
  const [remainingMs, setRemainingMs] = useState(0);
  const sessionExpired = remainingMs <= 0 && !loading && Boolean(ctx);
  const isDelivery = ctx?.metadata && typeof ctx.metadata === "object" && "fulfillment" in ctx.metadata ? ctx.metadata.fulfillment === "delivery" : false;
  const normalizedPostalCode = postalCode.replace(/\s+/g, "").toUpperCase();
  const postalCodeValid = !isDelivery || /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(normalizedPostalCode);
  const hasFieldError = Object.values(fieldErrors).some((v) => Boolean(v));
  const canSubmit = !submitting && !sessionExpired && cloverReady && canPay && !hasFieldError && postalCodeValid;

  const cloverRef = useRef<CloverInstance | null>(null);
  const fieldRefs = useRef<CloverElementInstance[]>([]);
  const cloverFieldStateRef = useRef<Partial<Record<CardFieldKey, CloverFieldChangeEvent>>>({});

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
        setFieldErrors({});
        setCloverReady(false);
        setCanPay(false);
        cloverFieldStateRef.current = {};
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
    const requiredFieldKeys: Array<Exclude<CardFieldKey, "CARD_NAME">> = ["CARD_NUMBER", "CARD_DATE", "CARD_CVV", "CARD_POSTAL_CODE"];
    const computeCanPay = (state: Partial<Record<CardFieldKey, CloverFieldChangeEvent>>) => requiredFieldKeys.every((k) => isFieldPayable(state[k]));

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
        const postalCodeHost = document.getElementById("clover-card-postal-code");
        if (!nameHost || !numberHost || !dateHost || !cvvHost || !postalCodeHost) throw new Error("Card fields not ready");

        fieldRefs.current.forEach((f) => f.destroy?.());
        fieldRefs.current = [];
        setCloverReady(false);
        setCanPay(false);
        cloverFieldStateRef.current = {};

        const clover = new Clover(publicKey, { merchantId });
        cloverRef.current = clover;
        const elements = clover.elements();
        const name = elements.create("CARD_NAME");
        const number = elements.create("CARD_NUMBER");
        const date = elements.create("CARD_DATE");
        const cvv = elements.create("CARD_CVV");
        const postalCode = elements.create("CARD_POSTAL_CODE");

        const bindFieldListener = (field: CloverElementInstance, key: CardFieldKey) => {
          const syncState = (payload: unknown) => {
            const fieldPayload = getFieldFromEvent(payload as CloverEventPayload, key);
            cloverFieldStateRef.current[key] = fieldPayload;

            const nextCanPay = computeCanPay(cloverFieldStateRef.current);
            setCanPay(nextCanPay);

            const nextError = typeof fieldPayload.error === "string"
              ? fieldPayload.error
              : fieldPayload.error && typeof fieldPayload.error === "object" && "message" in fieldPayload.error && typeof fieldPayload.error.message === "string"
                ? fieldPayload.error.message
                : "";
            setFieldErrors((prev) => {
              const next = { ...prev };
              if (nextError) next[key] = nextError;
              else delete next[key];
              return next;
            });

            if (key === "CARD_POSTAL_CODE") {
              const info = fieldPayload.info;
              if (typeof info === "string") setPostalCode(info);
              else if (info && typeof info === "object" && "value" in info && typeof (info as Record<string, unknown>).value === "string") {
                setPostalCode((info as { value: string }).value);
              } else if (typeof fieldPayload.value === "string") {
                setPostalCode(fieldPayload.value);
              }
            }
          };
          field.addEventListener("change", syncState);
          field.addEventListener("blur", syncState);
        };

        bindFieldListener(name, "CARD_NAME");
        bindFieldListener(number, "CARD_NUMBER");
        bindFieldListener(date, "CARD_DATE");
        bindFieldListener(cvv, "CARD_CVV");
        bindFieldListener(postalCode, "CARD_POSTAL_CODE");

        name.mount("#clover-card-name");
        number.mount("#clover-card-number");
        date.mount("#clover-card-date");
        cvv.mount("#clover-card-cvv");
        postalCode.mount("#clover-card-postal-code");
        fieldRefs.current = [name, number, date, cvv, postalCode];
        setCloverReady(true);

      } catch (err) {
        console.error("[CARD][session] init error", toSafeErrorLog(err));
        setError(locale === "zh" ? "银行卡支付初始化失败，请返回结算页重试。" : "Failed to initialize card payment. Please go back and try again.");
        setCloverReady(false);
        setCanPay(false);
      }
    };

    void init();
    return () => {
      cancelled = true;
      fieldRefs.current.forEach((f) => f.destroy?.());
      fieldRefs.current = [];
      cloverRef.current = null;
      cloverFieldStateRef.current = {};
      setCanPay(false);
      setCloverReady(false);
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
              <div id="clover-card-postal-code" className="flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-3" />
              {isDelivery && normalizedPostalCode.length > 0 && !postalCodeValid ? (
                <p className="text-xs text-rose-600">{locale === "zh" ? "配送订单需有效加拿大邮编。" : "Delivery requires a valid Canadian postal code."}</p>
              ) : null}
            </div>

            {hasFieldError ? (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                {(fieldErrors.CARD_NUMBER || fieldErrors.CARD_DATE || fieldErrors.CARD_CVV || fieldErrors.CARD_NAME || fieldErrors.CARD_POSTAL_CODE || (locale === "zh" ? "请检查银行卡信息输入是否正确。" : "Please verify your card details."))}
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
