"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api/client";
import { build3dsBrowserInfo, DEFAULT_CLOVER_SDK_URL, loadScript } from "@/lib/clover";
import type { Locale } from "@/lib/i18n/locales";
import {
  HOSTED_CHECKOUT_CURRENCY,
  type CardTokenPaymentResponse,
} from "@/lib/order/shared";

type PaymentCtx = {
  locale: Locale;
  checkoutIntentId: string;
  pricingToken: string;
  pricingTokenExpiresAt: string;
  currency: string;
  totalCents: number;
  metadata: Record<string, unknown>;
  paymentMethod?: "APPLE_PAY" | "GOOGLE_PAY" | "CARD";
};

type CloverElementInstance = {
  mount: (selector: string) => void;
  addEventListener: (event: string, handler: (payload: unknown) => void) => void;
  destroy?: () => void;
};

type CloverTokenResult = {
  token?: string;
  errors?: Array<{ message?: string }>;
};

type CloverInstance = {
  elements: () => {
    create: (type: string, options?: Record<string, unknown>) => CloverElementInstance;
  };
  createToken: () => Promise<CloverTokenResult>;
};

type CloverConstructor = new (
  key?: string,
  options?: { merchantId?: string },
) => CloverInstance;

const CARD_PAY_CTX_KEY = "sanq_card_pay_ctx_v1";

function toSafeErrorLog(error: unknown) {
  if (error instanceof ApiError) {
    return { name: error.name, message: error.message, status: error.status };
  }
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { message: String(error) };
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    p.then(
      (value) => {
        clearTimeout(id);
        resolve(value);
      },
      (error) => {
        clearTimeout(id);
        reject(error);
      },
    );
  });
}

function buildPaymentErrorMessage(locale: Locale, error: unknown) {
  if (error instanceof ApiError && error.payload && typeof error.payload === "object") {
    const payload = error.payload as Record<string, unknown>;
    const code = typeof payload.code === "string" ? payload.code : "";
    if (code === "AMOUNT_MISMATCH" || code === "pricing_token_amount_mismatch") {
      return locale === "zh"
        ? "订单金额已变更，请返回结算页重新确认后再支付。"
        : "Order amount changed. Please return to checkout and confirm again.";
    }
    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message;
    }
  }
  return locale === "zh"
    ? "银行卡支付失败，请返回结算页重试。"
    : "Card payment failed. Please go back and try again.";
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
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}
export default function CardPayWalletPage() {
  const params = useParams<{ locale?: string }>();
  const locale = (params?.locale === "zh" ? "zh" : "en") as Locale;
  const router = useRouter();

  const [ctx, setCtx] = useState<PaymentCtx | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [canPay, setCanPay] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const sessionExpired = remainingMs <= 0 && !loading && Boolean(ctx);

  const cloverRef = useRef<CloverInstance | null>(null);
  const fieldRefs = useRef<CloverElementInstance[]>([]);
  const fieldStateRef = useRef<Record<string, { complete?: boolean; error?: string | { message?: string } | null }>>({});

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale === "zh" ? "zh-Hans-CA" : "en-CA", {
        style: "currency",
        currency: HOSTED_CHECKOUT_CURRENCY,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [locale],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(CARD_PAY_CTX_KEY);
      if (!raw) {
        setError(locale === "zh" ? "支付信息已失效，请返回结算页重试。" : "Session expired. Please go back and try again.");
        setLoading(false);
        return;
      }
      const parsed = JSON.parse(raw) as PaymentCtx;
      if (!parsed?.pricingToken || !parsed?.checkoutIntentId || !parsed?.metadata) {
        setError(locale === "zh" ? "支付信息不完整，请返回结算页重试。" : "Missing payment context. Please go back and try again.");
        setLoading(false);
        return;
      }
      if (parsed.paymentMethod && parsed.paymentMethod !== "CARD") {
        setError(locale === "zh" ? "支付方式不匹配，请返回结算页重新选择。" : "Payment method mismatch. Please go back and choose again.");
        setLoading(false);
        return;
      }
      setCtx(parsed);
      setRemainingMs(getRemainingMs(parsed.pricingTokenExpiresAt));
      setLoading(false);
    } catch (readError) {
      console.error("[CARD] ctx parse error", toSafeErrorLog(readError));
      setError(locale === "zh" ? "支付信息读取失败，请返回结算页重试。" : "Failed to read payment context. Please go back and try again.");
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    if (!ctx) return;
    const tick = () => {
      setRemainingMs(getRemainingMs(ctx.pricingTokenExpiresAt));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearInterval(id);
    };
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

        const nameHost = document.getElementById("clover-card-name");
        const numberHost = document.getElementById("clover-card-number");
        const dateHost = document.getElementById("clover-card-date");
        const cvvHost = document.getElementById("clover-card-cvv");
        const postalHost = document.getElementById("clover-postal");

        if (!nameHost || !numberHost || !dateHost || !cvvHost || !postalHost) {
          throw new Error("Card fields not ready");
        }

        fieldRefs.current.forEach((f) => f.destroy?.());
        fieldRefs.current = [];
        fieldStateRef.current = {};
        setCanPay(false);

        const clover = new Clover(publicKey, { merchantId });
        cloverRef.current = clover;

        const name = clover.elements().create("CARD_NAME");
        const number = clover.elements().create("CARD_NUMBER");
        const date = clover.elements().create("CARD_DATE");
        const cvv = clover.elements().create("CARD_CVV");
        const postal = clover.elements().create("CARD_POSTAL_CODE");

        name.mount("#clover-card-name");
        number.mount("#clover-card-number");
        date.mount("#clover-card-date");
        cvv.mount("#clover-card-cvv");
        postal.mount("#clover-postal");

        fieldRefs.current = [name, number, date, cvv, postal];

        const requiredKeys = ["CARD_NUMBER", "CARD_DATE", "CARD_CVV", "CARD_POSTAL_CODE"];
        const updateState = (key: string, payload: unknown) => {
          const event = (payload && typeof payload === "object" ? payload : {}) as {
            complete?: boolean;
            error?: string | { message?: string } | null;
          };
          fieldStateRef.current[key] = { complete: event.complete, error: event.error ?? null };
          const ready = requiredKeys.every((k) => {
            const item = fieldStateRef.current[k];
            if (!item?.complete) return false;
            if (!item.error) return true;
            if (typeof item.error === "string") return item.error.trim().length === 0;
            return !(typeof item.error?.message === "string" && item.error.message.trim().length > 0);
          });
          setCanPay(ready);
        };

        name.addEventListener("change", (e) => updateState("CARD_NAME", e));
        number.addEventListener("change", (e) => updateState("CARD_NUMBER", e));
        date.addEventListener("change", (e) => updateState("CARD_DATE", e));
        cvv.addEventListener("change", (e) => updateState("CARD_CVV", e));
        postal.addEventListener("change", (e) => updateState("CARD_POSTAL_CODE", e));
      } catch (initError) {
        console.error("[CARD] init error", toSafeErrorLog(initError));
        setError(locale === "zh" ? "银行卡支付初始化失败，请返回结算页重试。" : "Failed to initialize card payment. Please go back and try again.");
      }
    };

    void init();

    return () => {
      cancelled = true;
      fieldRefs.current.forEach((f) => f.destroy?.());
      fieldRefs.current = [];
      fieldStateRef.current = {};
      cloverRef.current = null;
      setCanPay(false);
    };
  }, [ctx, locale]);

  const handlePay = async () => {
    if (!ctx || !cloverRef.current || submitting || !canPay || sessionExpired) {
      if (sessionExpired) {
        setError(
          locale === "zh"
            ? "支付会话已过期，请返回结算页重新发起支付。"
            : "Payment session expired. Please go back to checkout and restart payment.",
        );
      }
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const tokenResult = await cloverRef.current.createToken();
      if (!tokenResult?.token) {
        throw new Error(
          tokenResult?.errors?.[0]?.message ??
            (locale === "zh" ? "卡信息验证失败，请检查后重试。" : "Card verification failed. Please check and try again."),
        );
      }

      const browserInfo = build3dsBrowserInfo();
      const customer =
        ctx.metadata && typeof ctx.metadata === "object" && "customer" in ctx.metadata
          ? (ctx.metadata.customer as Record<string, unknown> | undefined)
          : undefined;

      const paymentResponse = await withTimeout(
        apiFetch<CardTokenPaymentResponse>("/clover/pay/online/card-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountCents: ctx.totalCents,
            currency: ctx.currency || HOSTED_CHECKOUT_CURRENCY,
            pricingToken: ctx.pricingToken,
            checkoutIntentId: ctx.checkoutIntentId,
            source: tokenResult.token,
            sourceType: "CARD",
            cardholderName:
              typeof customer?.firstName === "string" || typeof customer?.lastName === "string"
                ? `${typeof customer?.firstName === "string" ? customer.firstName : ""} ${typeof customer?.lastName === "string" ? customer.lastName : ""}`.trim() || "Card Holder"
                : "Card Holder",
            customer: customer ?? {},
            metadata: ctx.metadata,
            threeds: { source: "CLOVER", browserInfo },
          }),
        }),
        20000,
        "apiFetch /clover/pay/online/card-token",
      );

      if (!paymentResponse?.orderStableId) {
        throw new Error(locale === "zh" ? "支付处理中或失败，请返回结算页重试。" : "Payment is processing/failed. Please go back and try again.");
      }

      window.sessionStorage.removeItem(CARD_PAY_CTX_KEY);
      router.replace(`/${locale}/thank-you/${paymentResponse.orderStableId}`);
    } catch (payError) {
      console.error("[CARD] pay error", toSafeErrorLog(payError));
      setError(buildPaymentErrorMessage(locale, payError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 py-10">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          {locale === "zh" ? "银行卡支付" : "Card payment"}
        </h1>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">{locale === "zh" ? "正在加载支付信息…" : "Loading payment context…"}</p>
        ) : error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
        ) : ctx ? (
          <>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              <p>{locale === "zh" ? "应付金额（已锁定）" : "Amount due (locked)"}</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {currencyFormatter.format(ctx.totalCents / 100).replace(/^CA\$\s?/, "$")}
              </p>
              <p className={`mt-2 text-xs font-semibold ${sessionExpired ? "text-rose-600" : "text-slate-600"}`}>
                {locale === "zh" ? "支付会话剩余时间" : "Session time left"}：
                {formatRemaining(remainingMs)}
              </p>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="space-y-1 md:col-span-1">
                <label className="text-xs font-medium text-slate-600">{locale === "zh" ? "持卡人姓名" : "Name on card"} *</label>
                <div id="clover-card-name" className="flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-3" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-medium text-slate-600">{locale === "zh" ? "卡号" : "Card number"} *</label>
                <div id="clover-card-number" className="flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-3" />
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">{locale === "zh" ? "有效期" : "MM/YY"} *</label>
                <div id="clover-card-date" className="flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-3" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">{locale === "zh" ? "安全码" : "CVV"} *</label>
                <div id="clover-card-cvv" className="flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-3" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">{locale === "zh" ? "邮编" : "Postal code"} *</label>
                <div id="clover-postal" className="flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-3" />
              </div>
            </div>

            {sessionExpired ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                {locale === "zh"
                  ? "支付会话已过期，请返回结算页重新发起支付。"
                  : "Payment session expired. Please go back to checkout and restart payment."}
              </div>
            ) : null}

            <button
              type="button"
              className="mt-5 w-full rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-200"
              onClick={() => {
                void handlePay();
              }}
              disabled={submitting || !canPay || sessionExpired}
            >
              {submitting
                ? locale === "zh"
                  ? "支付处理中…"
                  : "Processing..."
                : locale === "zh"
                  ? "确认并支付"
                  : "Pay now"}
            </button>
          </>
        ) : null}

        <button
          type="button"
          className="mt-4 w-full rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          onClick={() => {
            router.replace(`/${locale}/checkout`);
          }}
        >
          {locale === "zh" ? "返回结算页修改订单" : "Back to checkout"}
        </button>
      </div>
    </main>
  );
}
