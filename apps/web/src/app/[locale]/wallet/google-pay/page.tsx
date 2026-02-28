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
type CloverConstructor = new (key?: string, options?: { merchantId?: string }) => CloverInstance;
type CloverInstance = { elements: () => { create: (type: string, options?: Record<string, unknown>) => CloverElementInstance }; updateGooglePaymentStatus?: (status: "success" | "failed") => void };

function toSafeErrorLog(error: unknown) { if (error instanceof Error) return { name: error.name, message: error.message }; return { message: String(error) }; }
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> { return new Promise((resolve, reject) => { const id = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms); p.then((value) => { clearTimeout(id); resolve(value); }, (error) => { clearTimeout(id); reject(error); }); }); }
function getRemainingMs(expiresAtIso?: string): number { if (!expiresAtIso) return 0; const expiresAt = Date.parse(expiresAtIso); if (!Number.isFinite(expiresAt)) return 0; return Math.max(0, expiresAt - Date.now()); }
function formatRemaining(remainingMs: number): string { const t = Math.max(0, Math.ceil(remainingMs / 1000)); return `${Math.floor(t / 60).toString().padStart(2, "0")}:${(t % 60).toString().padStart(2, "0")}`; }

function buildPaymentErrorMessage(locale: Locale, error: unknown) {
  if (error instanceof ApiError && error.payload && typeof error.payload === "object") {
    const payload = error.payload as Record<string, unknown>;
    const code = typeof payload.code === "string" ? payload.code : "";
    if (["AMOUNT_MISMATCH", "pricing_token_amount_mismatch", "PAYMENT_SESSION_EXPIRED"].includes(code)) {
      return locale === "zh" ? "订单金额或会话状态已变更，请返回结算页重新确认后再支付。" : "Order amount/session changed. Please return to checkout and confirm again.";
    }
    if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  }
  return locale === "zh" ? "Google Pay 支付失败，请返回结算页重试。" : "Google Pay failed. Please go back and try again.";
}

export default function GooglePayWalletPage() {
  const params = useParams<{ locale?: string }>();
  const searchParams = useSearchParams();
  const locale = (params?.locale === "zh" ? "zh" : "en") as Locale;
  const router = useRouter();

  const [ctx, setCtx] = useState<PaymentCtx | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [remainingMs, setRemainingMs] = useState(0);
  const sessionExpired = remainingMs <= 0 && !loading && Boolean(ctx);

  const cloverGoogleRef = useRef<CloverInstance | null>(null);
  const googlePayRef = useRef<CloverElementInstance | null>(null);
  const submittedTokenRef = useRef<string | null>(null);

  const currencyFormatter = useMemo(() => new Intl.NumberFormat(locale === "zh" ? "zh-Hans-CA" : "en-CA", { style: "currency", currency: HOSTED_CHECKOUT_CURRENCY, minimumFractionDigits: 2, maximumFractionDigits: 2 }), [locale]);

  useEffect(() => {
    const sessionId = searchParams.get("sessionId")?.trim();
    if (!sessionId) { setError(locale === "zh" ? "缺少支付会话，请返回结算页重试。" : "Missing payment session. Please go back and try again."); setLoading(false); return; }
    let cancelled = false;
    const loadSession = async () => {
      try {
        console.debug("[GP][session] enter", { sessionId });
        const data = await withTimeout(apiFetch<PaymentSessionFetchResponse>(`/clover/pay/online/session?sessionId=${encodeURIComponent(sessionId)}&paymentMethod=GOOGLE_PAY`), 15000, "apiFetch /clover/pay/online/session");
        if (cancelled) return;
        setCtx({ sessionId: data.sessionId, paymentMethod: (data.paymentMethod as PaymentCtx["paymentMethod"]) ?? "GOOGLE_PAY", locale, checkoutIntentId: data.checkoutIntentId, pricingToken: data.pricingToken, pricingTokenExpiresAt: data.pricingTokenExpiresAt, currency: data.currency || HOSTED_CHECKOUT_CURRENCY, totalCents: data.quote.totalCents, metadata: data.metadata });
        setRemainingMs(getRemainingMs(data.pricingTokenExpiresAt));
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error("[GP][session] load error", toSafeErrorLog(err));
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
        const host = document.getElementById("clover-google-pay");
        if (!host) throw new Error("Google Pay host not ready");

        googlePayRef.current?.destroy?.();
        submittedTokenRef.current = null;

        const cloverGoogle = new Clover(publicKey, { merchantId });
        cloverGoogleRef.current = cloverGoogle;

        const gp = cloverGoogle.elements().create("PAYMENT_REQUEST_BUTTON", {
          paymentReqData: { total: { label: "Total", amount: ctx.totalCents }, options: { button: { buttonType: "short" } } },
        });

        host.innerHTML = "";
        gp.mount("#clover-google-pay");
        googlePayRef.current = gp;

        gp.addEventListener("paymentMethod", async (evt: unknown) => {
          const detail = typeof evt === "object" && evt && "detail" in evt ? (evt as { detail?: Record<string, unknown> }).detail : undefined;
          const token = (detail?.tokenReceived as { id?: string } | undefined)?.id ?? (detail?.tokenRecieved as { id?: string } | undefined)?.id ?? (detail?.token as { id?: string } | undefined)?.id;
          if (!token) return;
          if (sessionExpired) { setError(locale === "zh" ? "支付会话已过期，请返回结算页重新发起支付。" : "Payment session expired. Please go back to checkout and restart payment."); return; }
          if (submittedTokenRef.current === token) return;
          submittedTokenRef.current = token;
          setError(null);
          console.debug("[GP][token] received", { sessionId: ctx.sessionId });

          try {
            const browserInfo = build3dsBrowserInfo();
            const customer = ctx.metadata && typeof ctx.metadata === "object" && "customer" in ctx.metadata ? (ctx.metadata.customer as Record<string, unknown> | undefined) : undefined;
            const firstName = typeof customer?.firstName === "string" ? customer.firstName.trim() : "";
            const lastName = typeof customer?.lastName === "string" ? customer.lastName.trim() : "";
            const cardholderName = `${firstName} ${lastName}`.trim() || "Google Pay";
            console.debug("[GP][submit] start", { sessionId: ctx.sessionId, checkoutIntentId: ctx.checkoutIntentId });
            const paymentResponse = await withTimeout(apiFetch<CardTokenPaymentResponse>("/clover/pay/online/card-token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ amountCents: ctx.totalCents, currency: ctx.currency || HOSTED_CHECKOUT_CURRENCY, pricingToken: ctx.pricingToken, checkoutIntentId: ctx.checkoutIntentId, source: token, sourceType: "CARD", cardholderName, customer: customer ?? {}, metadata: ctx.metadata, threeds: { source: "CLOVER", browserInfo } }),
            }), 20000, "apiFetch /clover/pay/online/card-token");

            if (!paymentResponse?.orderStableId) throw new Error(locale === "zh" ? "支付处理中或失败，请返回结算页重试。" : "Payment is processing/failed. Please go back and try again.");
            cloverGoogleRef.current?.updateGooglePaymentStatus?.("success");
            router.replace(`/${locale}/thank-you/${paymentResponse.orderStableId}`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.toLowerCase().includes("timeout")) console.error("[GP][submit-timeout]", toSafeErrorLog(err));
            else console.error("[GP][submit-error]", toSafeErrorLog(err));
            cloverGoogleRef.current?.updateGooglePaymentStatus?.("failed");
            setError(buildPaymentErrorMessage(locale, err));
            submittedTokenRef.current = null;
          }
        });
      } catch (initError) {
        console.error("[GP][session] init error", toSafeErrorLog(initError));
        setError(locale === "zh" ? "Google Pay 初始化失败，请返回结算页重试。" : "Failed to initialize Google Pay. Please go back and try again.");
      }
    };

    void init();
    return () => { cancelled = true; googlePayRef.current?.destroy?.(); googlePayRef.current = null; cloverGoogleRef.current = null; submittedTokenRef.current = null; };
  }, [ctx, locale, router, sessionExpired]);

  if (loading) return <div className="mx-auto max-w-lg p-6 text-sm text-slate-600">{locale === "zh" ? "正在加载 Google Pay…" : "Loading Google Pay…"}</div>;

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-lg font-semibold text-slate-900">{locale === "zh" ? "Google Pay 支付" : "Pay with Google Pay"}</h1>

      {ctx ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <div className="flex items-center justify-between"><span>{locale === "zh" ? "本次支付金额" : "Total"}</span><span className="font-semibold">{currencyFormatter.format(ctx.totalCents / 100).replace(/^CA\$\s?/, "$")}</span></div>
          <p className="mt-2 text-[11px] text-slate-500">{locale === "zh" ? "金额已按优惠券/积分/配送费/税重新计算。" : "Total reflects coupons/points/delivery/tax."}</p>
          <p className={`mt-2 text-xs font-semibold ${sessionExpired ? "text-rose-600" : "text-slate-600"}`}>{locale === "zh" ? "支付会话剩余时间" : "Session time left"}：{formatRemaining(remainingMs)}</p>
        </div>
      ) : null}

      {sessionExpired ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{locale === "zh" ? "支付会话已过期，请返回结算页重新发起支付。" : "Payment session expired. Please go back to checkout and restart payment."}</div>
      ) : (
        <div id="clover-google-pay" className="h-12 overflow-hidden rounded-2xl border border-slate-200 bg-white" />
      )}

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div> : null}

      <button type="button" onClick={() => router.replace(`/${locale}/checkout`)} className="w-full rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">{locale === "zh" ? "返回结算页" : "Back to checkout"}</button>
    </div>
  );
}
