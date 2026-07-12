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

type CloverAppleContactField = "postalAddress" | "name" | "email" | "phone";
type CloverApplePaymentRequest = {
  amount: number;
  countryCode: string;
  currencyCode: string;
  requiredBillingContactFields?: CloverAppleContactField[];
  requiredShippingContactFields?: CloverAppleContactField[];
};
type CloverElementInstance = {
  mount: (selector: string) => void;
  destroy?: () => void;
  addEventListener?: (type: string, listener: (event: unknown) => void) => void;
};
type CloverInstance = {
  elements: () => { create: (type: string, options?: Record<string, unknown>) => CloverElementInstance };
  createApplePaymentRequest: (request: CloverApplePaymentRequest) => CloverApplePaymentRequest;
  updateApplePaymentStatus: (status: "success" | "failed") => void;
};
type CloverConstructor = new (key?: string, options?: { merchantId?: string }) => CloverInstance;
type ApplePayProgressState = "idle" | "started" | "tokenReceived" | "submitted" | "finished";
type ApplePaySessionConstructor = {
  supportsVersion?: (version: number) => boolean;
  canMakePayments?: () => boolean;
};
type ApplePayWindow = Window & {
  ApplePaySession?: ApplePaySessionConstructor;
  Clover?: CloverConstructor;
};

function getApplePayEventDetail(event: Event): Record<string, unknown> | undefined {
  if (!(event instanceof CustomEvent)) return undefined;
  return event.detail && typeof event.detail === "object" && !Array.isArray(event.detail) ? (event.detail as Record<string, unknown>) : undefined;
}

function getApplePayToken(detail: Record<string, unknown> | undefined): string | undefined {
  const misspelledToken = detail?.tokenRecieved;
  if (misspelledToken && typeof misspelledToken === "object" && "id" in misspelledToken && typeof (misspelledToken as { id?: unknown }).id === "string") {
    return (misspelledToken as { id: string }).id;
  }

  const correctedToken = detail?.tokenReceived;
  if (correctedToken && typeof correctedToken === "object" && "id" in correctedToken && typeof (correctedToken as { id?: unknown }).id === "string") {
    return (correctedToken as { id: string }).id;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function buildApplePayEventLog(detail: Record<string, unknown> | undefined) {
  const tokenRecieved = isRecord(detail?.tokenRecieved) ? detail.tokenRecieved : undefined;
  const tokenReceived = isRecord(detail?.tokenReceived) ? detail.tokenReceived : undefined;

  return {
    hasDetail: !!detail,
    detailKeys: detail ? Object.keys(detail) : [],
    hasTokenRecieved: !!detail?.tokenRecieved,
    hasTokenReceived: !!detail?.tokenReceived,
    tokenRecievedKeys: tokenRecieved ? Object.keys(tokenRecieved) : [],
    tokenReceivedKeys: tokenReceived ? Object.keys(tokenReceived) : [],
    hasTokenRecievedId: typeof tokenRecieved?.id === "string" && tokenRecieved.id.length > 0,
    hasTokenReceivedId: typeof tokenReceived?.id === "string" && tokenReceived.id.length > 0,
    status: typeof detail?.status === "string" ? detail.status : undefined,
    eventMessage: typeof detail?.eventMessage === "string" ? detail.eventMessage : undefined,
    message: typeof detail?.message === "string" ? detail.message : undefined,
    reason: typeof detail?.reason === "string" ? detail.reason : undefined,
    code: typeof detail?.code === "string" ? detail.code : undefined,
  };
}

function getUnknownEventDetail(event: unknown): Record<string, unknown> | undefined {
  if (event instanceof CustomEvent) return getApplePayEventDetail(event);
  if (event && typeof event === "object" && "detail" in event) {
    const detail = (event as { detail?: unknown }).detail;
    if (detail && typeof detail === "object" && !Array.isArray(detail)) return detail as Record<string, unknown>;
  }
  if (event && typeof event === "object" && !Array.isArray(event)) return event as Record<string, unknown>;
  return undefined;
}

function getApplePayCapabilityLog() {
  const applePaySession = typeof window !== "undefined" ? (window as ApplePayWindow).ApplePaySession : undefined;
  return {
    hasApplePaySession: !!applePaySession,
    supportsApplePayV3: applePaySession?.supportsVersion?.(3),
    canMakePayments: applePaySession?.canMakePayments?.(),
  };
}

function buildApplePayInitErrorMessage(locale: Locale, error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.includes("ApplePaySession is not available") || message.includes("Apple Pay v3 is not supported")) {
    return locale === "zh"
      ? "当前浏览器不支持 Apple Pay。请使用 Apple 设备上的 Safari 浏览器，或返回结算页改用其他支付方式。"
      : "This browser does not support Apple Pay. Please use Safari on an Apple device, or go back and choose another payment method.";
  }
  if (message.includes("cannot make payments")) {
    return locale === "zh"
      ? "当前设备暂时无法使用 Apple Pay。请确认钱包中已添加可用银行卡，或返回结算页改用其他支付方式。"
      : "Apple Pay is not available on this device right now. Please confirm Wallet has an eligible card, or go back and choose another payment method.";
  }
  return locale === "zh"
    ? "Apple Pay 暂时无法启动。请返回结算页重试，或改用其他支付方式。"
    : "Apple Pay could not be started right now. Please go back and try again, or choose another payment method.";
}

function buildApplePayElementErrorMessage(locale: Locale, detail: Record<string, unknown> | undefined) {
  const message = [detail?.eventMessage, detail?.message, detail?.reason]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0)
    ?.trim();
  const code = typeof detail?.code === "string" && detail.code.trim() ? detail.code.trim() : "";
  const suffix = [code, message].filter(Boolean).join(": ");
  if (!suffix) {
    return locale === "zh"
      ? "Apple Pay 暂时无法启动。请确认当前域名已在 Clover/Apple Pay 中完成验证，或返回结算页改用其他支付方式。"
      : "Apple Pay could not be started. Please confirm this domain is verified for Clover/Apple Pay, or choose another payment method.";
  }
  return locale === "zh"
    ? `Apple Pay 暂时无法启动（${suffix}）。请返回结算页重试，或改用其他支付方式。`
    : `Apple Pay could not be started (${suffix}). Please go back and try again, or choose another payment method.`;
}

function getApplePayMissingTokenMessage(locale: Locale) {
  return locale === "zh"
    ? "Apple Pay 未返回支付令牌，请关闭支付窗口后重试或改用其他支付方式。"
    : "Apple Pay did not return a payment token. Please close the payment sheet and try again or use another payment method.";
}

function toSafeErrorLog(error: unknown) {
  if (error instanceof ApiError) return { name: error.name, message: error.message, status: error.status };
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { message: String(error) };
}

function postApplePayClientEvent(payload: {
  eventName: string;
  sessionId?: string;
  checkoutIntentId?: string;
  detail?: Record<string, unknown>;
  capability?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}) {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({
    ...payload,
    href: window.location.href,
    origin: window.location.origin,
    userAgent: window.navigator.userAgent,
  });
  const url = "/api/v1/clover/pay/online/apple-pay-event";
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(url, blob)) return;
    }
  } catch {
    // Fall through to fetch. This logger must never block Apple Pay.
  }
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body,
    credentials: "include",
    cache: "no-store",
    keepalive: true,
  }).catch(() => undefined);
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
  const fallbackReason = locale === "zh" ? "系统未返回具体原因" : "No detailed reason returned";
  const wrapWithFallback = (reason?: string) => {
    const finalReason = typeof reason === "string" && reason.trim() ? reason.trim() : fallbackReason;
    return locale === "zh"
      ? `支付失败（${finalReason}），请改用其他支付方式`
      : `Payment failed (${finalReason}). Please use another payment method.`;
  };

  if (error instanceof ApiError && error.payload && typeof error.payload === "object") {
    const payload = error.payload as Record<string, unknown>;
    const code = typeof payload.code === "string" ? payload.code : "";
    const payloadMessage = typeof payload.message === "string" ? payload.message : "";

    const avsPostalMismatchByCode = ["POSTAL_CODE_MISMATCH", "AVS_POSTAL_MISMATCH", "postal_mismatch"].includes(code);
    const avsPostalMismatchByMessage = /postal\s*code\s*mismatch|avs/i.test(payloadMessage);
    if (avsPostalMismatchByCode || avsPostalMismatchByMessage) {
      return wrapWithFallback(locale === "zh" ? "账单邮编校验失败（postal code mismatch）" : "Billing postal code verification failed (postal code mismatch)");
    }

    if (["AMOUNT_MISMATCH", "pricing_token_amount_mismatch", "PAYMENT_SESSION_EXPIRED"].includes(code)) {
      return locale === "zh" ? "订单金额或会话状态已变更，请返回结算页重新确认后再支付。" : "Order amount/session changed. Please return to checkout and confirm again.";
    }
    if (payloadMessage.trim()) return wrapWithFallback(payloadMessage);
  }
  if (error instanceof Error && error.message.trim()) return wrapWithFallback(error.message);
  return wrapWithFallback();
}

export default function ApplePayWalletPage() {
  const params = useParams<{ locale?: string }>();
  const searchParams = useSearchParams();
  const locale = (params?.locale === "zh" ? "zh" : "en") as Locale;
  const router = useRouter();

  const [ctx, setCtx] = useState<PaymentCtx | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [remainingMs, setRemainingMs] = useState(0);
  const [applePayInteractionActive, setApplePayInteractionActive] = useState(false);
  const [applePayElementResetNonce, setApplePayElementResetNonce] = useState(0);
  const sessionExpired = remainingMs <= 0 && !loading && Boolean(ctx);

  const cloverRef = useRef<CloverInstance | null>(null);
  const applePayRef = useRef<CloverElementInstance | null>(null);
  const submittedTokenRef = useRef<string | null>(null);
  const initRunIdRef = useRef(0);
  const sessionExpiredRef = useRef(false);
  const applePayProgressRef = useRef<ApplePayProgressState>("idle");
  const applePayStartTimerRef = useRef<number | null>(null);

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
        setApplePayInteractionActive(false);
        setApplePayElementResetNonce((value) => value + 1);
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
    sessionExpiredRef.current = sessionExpired;
  }, [sessionExpired]);

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
    postApplePayClientEvent({
      eventName: "env",
      sessionId: ctx.sessionId,
      checkoutIntentId: ctx.checkoutIntentId,
      capability: getApplePayCapabilityLog(),
      extra: {
        sdkUrl,
        hostname: window.location.hostname,
        protocol: window.location.protocol,
        hasPublicKey: !!publicKey,
        publicKeyTail: publicKey?.slice(-6),
        hasMerchantId: !!merchantId,
        merchantIdTail: merchantId?.slice(-6),
      },
    });
    if (!publicKey || !merchantId) {
      setError(locale === "zh" ? "支付初始化失败：缺少 Clover 配置。" : "Payment init failed: missing Clover config.");
      return;
    }

    let cancelled = false;
    let resetRequested = false;
    const initRunId = initRunIdRef.current + 1;
    initRunIdRef.current = initRunId;
    const isCurrentInit = () => !cancelled && initRunIdRef.current === initRunId;
    const resetApplePayElement = () => {
      if (resetRequested) return;
      resetRequested = true;
      setApplePayElementResetNonce((value) => value + 1);
    };

    const handleApplePayTokenEvent = async (event: unknown, eventName: string) => {
      const detail = getUnknownEventDetail(event);
      postApplePayClientEvent({
        eventName,
        sessionId: ctx.sessionId,
        checkoutIntentId: ctx.checkoutIntentId,
        detail: buildApplePayEventLog(detail),
        capability: getApplePayCapabilityLog(),
      });
      const token = getApplePayToken(detail);
      if (!token) {
        console.error("[AP][token-missing]", {
          sessionId: ctx.sessionId,
          ...buildApplePayEventLog(detail),
        });
        cloverRef.current?.updateApplePaymentStatus("failed");
        setApplePayInteractionActive(false);
        setError(getApplePayMissingTokenMessage(locale));
        return;
      }
      if (sessionExpiredRef.current) {
        console.warn("[AP][session-expired-before-submit]", { sessionId: ctx.sessionId });
        cloverRef.current?.updateApplePaymentStatus("failed");
        setApplePayInteractionActive(false);
        setError(locale === "zh" ? "支付会话已过期，请返回结算页重新发起支付。" : "Payment session expired. Please go back to checkout and restart payment.");
        return;
      }
      if (submittedTokenRef.current === token) return;
      submittedTokenRef.current = token;
      applePayProgressRef.current = "tokenReceived";
      setError(null);
      try {
        const browserInfo = build3dsBrowserInfo();
        const customer = ctx.metadata && typeof ctx.metadata === "object" && "customer" in ctx.metadata ? (ctx.metadata.customer as Record<string, unknown> | undefined) : undefined;
        applePayProgressRef.current = "submitted";
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
        applePayProgressRef.current = "finished";
        setApplePayInteractionActive(false);
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
        setApplePayInteractionActive(false);
        setError(buildPaymentErrorMessage(locale, err));
        submittedTokenRef.current = null;
        applePayProgressRef.current = "idle";
        if (applePayStartTimerRef.current) {
          window.clearTimeout(applePayStartTimerRef.current);
          applePayStartTimerRef.current = null;
        }
      }
    };

    const handleApplePayEndEvent = (event: unknown, eventName: string) => {
      const detail = getUnknownEventDetail(event);
      postApplePayClientEvent({
        eventName,
        sessionId: ctx.sessionId,
        checkoutIntentId: ctx.checkoutIntentId,
        detail: buildApplePayEventLog(detail),
        capability: getApplePayCapabilityLog(),
      });
      if (applePayStartTimerRef.current) {
        window.clearTimeout(applePayStartTimerRef.current);
        applePayStartTimerRef.current = null;
      }
      const status = typeof detail?.status === "string" ? detail.status : undefined;
      if (applePayProgressRef.current === "submitted") cloverRef.current?.updateApplePaymentStatus("failed");
      setApplePayInteractionActive(false);
      if (status === "session_cancelled") {
        setError(locale === "zh" ? "Apple Pay 会话已取消或超时，请重试或改用其他支付方式。" : "Apple Pay was cancelled or timed out. Please try again or use another payment method.");
        submittedTokenRef.current = null;
        applePayProgressRef.current = "idle";
        resetApplePayElement();
        return;
      }
      if (applePayProgressRef.current !== "finished") setInitError(buildApplePayElementErrorMessage(locale, detail));
    };

    // Clover's Apple Pay iframe docs specify window-level paymentMethod/paymentMethodEnd
    // listeners for token and session-end callbacks. Do not attach Apple Pay element-level
    // listeners here so callback handling follows the documented dispatch layer only.
    const onWindowPaymentMethod = (event: Event) => {
      void handleApplePayTokenEvent(event, "window.paymentMethod");
    };
    const onWindowPaymentAuthorize = (event: Event) => {
      void handleApplePayTokenEvent(event, "window.paymentAuthorize");
    };
    const onWindowPaymentMethodEnd = (event: Event) => {
      handleApplePayEndEvent(event, "window.paymentMethodEnd");
    };
    const onWindowError = (event: ErrorEvent) => {
      postApplePayClientEvent({
        eventName: "windowError",
        sessionId: ctx.sessionId,
        checkoutIntentId: ctx.checkoutIntentId,
        capability: getApplePayCapabilityLog(),
        detail: {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error instanceof Error ? event.error.message : String(event.error || ""),
        },
      });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      postApplePayClientEvent({
        eventName: "unhandledRejection",
        sessionId: ctx.sessionId,
        checkoutIntentId: ctx.checkoutIntentId,
        capability: getApplePayCapabilityLog(),
        detail: event.reason instanceof Error ? toSafeErrorLog(event.reason) : { reason: String(event.reason || "") },
      });
    };
    window.addEventListener("paymentMethod", onWindowPaymentMethod);
    window.addEventListener("paymentAuthorize", onWindowPaymentAuthorize);
    window.addEventListener("paymentMethodEnd", onWindowPaymentMethodEnd);
    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    const init = async () => {
      try {
        setInitError(null);
        const applePaySession = (window as ApplePayWindow).ApplePaySession;
        if (!applePaySession) throw new Error("ApplePaySession is not available");
        if (applePaySession.supportsVersion && !applePaySession.supportsVersion(3)) throw new Error("Apple Pay v3 is not supported by this browser");
        if (applePaySession.canMakePayments && !applePaySession.canMakePayments()) throw new Error("Apple Pay cannot make payments on this device");
        await loadScript(sdkUrl);
        if (!isCurrentInit()) return;
        const Clover = (window as ApplePayWindow).Clover;
        if (!Clover) throw new Error("Clover SDK not available");
        const host = document.getElementById("clover-apple-pay");
        if (!host) throw new Error("Apple Pay host not ready");
        applePayRef.current?.destroy?.();
        submittedTokenRef.current = null;
        applePayProgressRef.current = "idle";
        if (applePayStartTimerRef.current) {
          window.clearTimeout(applePayStartTimerRef.current);
          applePayStartTimerRef.current = null;
        }
        const clover = new Clover(publicKey, { merchantId });
        cloverRef.current = clover;
        const appleReq = clover.createApplePaymentRequest({
          amount: ctx.totalCents,
          countryCode: "CA",
          currencyCode: ctx.currency || HOSTED_CHECKOUT_CURRENCY,
        });
        const applePay = clover.elements().create("PAYMENT_REQUEST_BUTTON_APPLE_PAY", { applePaymentRequest: appleReq, sessionIdentifier: merchantId });
        host.innerHTML = "";
        applePay.mount("#clover-apple-pay");
        if (!isCurrentInit()) {
          applePay.destroy?.();
          return;
        }
        postApplePayClientEvent({
          eventName: "button.mounted",
          sessionId: ctx.sessionId,
          checkoutIntentId: ctx.checkoutIntentId,
          capability: getApplePayCapabilityLog(),
          extra: { merchantIdTail: merchantId.slice(-6), sdkUrl },
        });
        applePayRef.current = applePay;
      } catch (err) {
        if (!isCurrentInit()) return;
        console.error("[AP][session] init error", {
          ...toSafeErrorLog(err),
          sessionId: ctx.sessionId,
          sdkUrl,
          hasPublicKey: !!publicKey,
          merchantIdTail: merchantId.slice(-6),
          origin: window.location.origin,
          ...getApplePayCapabilityLog(),
        });
        postApplePayClientEvent({
          eventName: "init.error",
          sessionId: ctx.sessionId,
          checkoutIntentId: ctx.checkoutIntentId,
          detail: toSafeErrorLog(err),
          capability: getApplePayCapabilityLog(),
          extra: {
            sdkUrl,
            hasPublicKey: !!publicKey,
            merchantIdTail: merchantId.slice(-6),
            origin: window.location.origin,
          },
        });
        setInitError(buildApplePayInitErrorMessage(locale, err));
      }
    };
    void init();
    return () => {
      cancelled = true;
      window.removeEventListener("paymentMethod", onWindowPaymentMethod);
      window.removeEventListener("paymentAuthorize", onWindowPaymentAuthorize);
      window.removeEventListener("paymentMethodEnd", onWindowPaymentMethodEnd);
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      if (initRunIdRef.current === initRunId) {
        applePayRef.current?.destroy?.();
        applePayRef.current = null;
        cloverRef.current = null;
        submittedTokenRef.current = null;
        applePayProgressRef.current = "idle";
        if (applePayStartTimerRef.current) {
          window.clearTimeout(applePayStartTimerRef.current);
          applePayStartTimerRef.current = null;
        }
      }
    };
  }, [applePayElementResetNonce, ctx, locale, router]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 py-10">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">{locale === "zh" ? "Apple Pay 支付" : "Apple Pay"}</h1>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">{locale === "zh" ? "正在加载支付信息…" : "Loading payment context…"}</p>
        ) : ctx ? (
          <>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              <p>{locale === "zh" ? "应付金额" : "Amount due"}</p>
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
              <div className="relative mt-4">
                <div id="clover-apple-pay" className={`flex h-12 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white ${applePayInteractionActive ? "pointer-events-none opacity-60" : ""}`} />
                {applePayInteractionActive ? (
                  <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/80 px-3 text-center text-xs font-semibold text-slate-600">
                    {locale === "zh" ? "请在 Apple Pay 界面完成验证，超时或取消后可重试。" : "Complete verification in Apple Pay. You can retry after timeout or cancellation."}
                  </div>
                ) : null}
              </div>
            )}
            {initError ? <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{initError}</div> : null}
            {error ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
          </>
        ) : error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
        ) : null}

        <button type="button" className="mt-6 w-full rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => router.replace(`/${locale}/checkout`)}>
          {locale === "zh" ? "返回结算页" : "Back to checkout"}
        </button>
      </div>
    </main>
  );
}
