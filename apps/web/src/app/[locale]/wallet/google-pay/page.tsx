"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import { build3dsBrowserInfo, DEFAULT_CLOVER_SDK_URL, loadScript } from "@/lib/clover";
import type { Locale } from "@/lib/i18n/locales";
import {
  HOSTED_CHECKOUT_CURRENCY,
  type CardTokenPaymentResponse,
} from "@/lib/order/shared";

type CloverElementInstance = {
  mount: (selector: string) => void;
  addEventListener: (
    event: string,
    handler: (payload: unknown) => void,
  ) => void;
  destroy?: () => void;
};

type CloverInstance = {
  elements: () => {
    create: (type: string, options?: Record<string, unknown>) => CloverElementInstance;
  };
  updateGooglePaymentStatus?: (status: "success" | "failed") => void;
};

declare global {
  interface Window {
    Clover?: new (key?: string, options?: { merchantId?: string }) => CloverInstance;
  }
}

type GooglePayCtx = {
  locale: Locale;
  checkoutIntentId: string;
  pricingToken: string;
  pricingTokenExpiresAt: string;
  currency: string;
  totalCents: number;
  metadata: Record<string, unknown>;
};

const GOOGLE_PAY_CTX_KEY = "sanq_google_pay_ctx_v1";

function toSafeErrorLog(error: unknown) {
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

export default function GooglePayWalletPage() {
  const params = useParams<{ locale?: string }>();
  const locale = (params?.locale === "zh" ? "zh" : "en") as Locale;
  const router = useRouter();

  const [ctx, setCtx] = useState<GooglePayCtx | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const cloverGoogleRef = useRef<CloverInstance | null>(null);
  const googlePayRef = useRef<CloverElementInstance | null>(null);
  const submittedTokenRef = useRef<string | null>(null);

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
      const raw = window.sessionStorage.getItem(GOOGLE_PAY_CTX_KEY);
      if (!raw) {
        setError(
          locale === "zh"
            ? "支付信息已失效，请返回结算页重试。"
            : "Session expired. Please go back and try again.",
        );
        setLoading(false);
        return;
      }
      const parsed = JSON.parse(raw) as GooglePayCtx;
      if (!parsed?.pricingToken || !parsed?.checkoutIntentId || !parsed?.metadata) {
        setError(
          locale === "zh"
            ? "支付信息不完整，请返回结算页重试。"
            : "Missing payment context. Please go back and try again.",
        );
        setLoading(false);
        return;
      }
      setCtx(parsed);
      setLoading(false);
    } catch (readError) {
      console.error("[GP] ctx parse error", toSafeErrorLog(readError));
      setError(
        locale === "zh"
          ? "支付信息读取失败，请返回结算页重试。"
          : "Failed to read payment context. Please go back and try again.",
      );
      setLoading(false);
    }
  }, [locale]);

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
        if (!window.Clover) throw new Error("Clover SDK not available");

        const host = document.getElementById("clover-google-pay");
        if (!host) throw new Error("Google Pay host not ready");

        googlePayRef.current?.destroy?.();
        googlePayRef.current = null;
        cloverGoogleRef.current = null;
        submittedTokenRef.current = null;

        const cloverGoogle = new window.Clover(publicKey, { merchantId });
        cloverGoogleRef.current = cloverGoogle;

        const gp = cloverGoogle.elements().create("PAYMENT_REQUEST_BUTTON", {
          paymentReqData: {
            total: { label: "Total", amount: ctx.totalCents },
            options: { button: { buttonType: "short" } },
          },
        });

        host.innerHTML = "";
        gp.mount("#clover-google-pay");
        googlePayRef.current = gp;

        gp.addEventListener("paymentMethod", async (evt: unknown) => {
          const detail =
            typeof evt === "object" && evt && "detail" in evt
              ? (evt as { detail?: Record<string, unknown> }).detail
              : undefined;

          const token =
            (detail?.tokenReceived as { id?: string } | undefined)?.id ??
            (detail?.tokenRecieved as { id?: string } | undefined)?.id ??
            (detail?.token as { id?: string } | undefined)?.id;

          if (!token) return;
          if (submittedTokenRef.current === token) return;
          submittedTokenRef.current = token;
          setError(null);

          try {
            const browserInfo = build3dsBrowserInfo();
            const customer =
              ctx.metadata && typeof ctx.metadata === "object" && "customer" in ctx.metadata
                ? (ctx.metadata.customer as Record<string, unknown> | undefined)
                : undefined;
            const firstName = typeof customer?.firstName === "string" ? customer.firstName.trim() : "";
            const lastName = typeof customer?.lastName === "string" ? customer.lastName.trim() : "";
            const cardholderName = `${firstName} ${lastName}`.trim() || "Google Pay";

            const paymentResponse = await withTimeout(
              apiFetch<CardTokenPaymentResponse>("/clover/pay/online/card-token", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  amountCents: ctx.totalCents,
                  currency: ctx.currency || HOSTED_CHECKOUT_CURRENCY,
                  pricingToken: ctx.pricingToken,
                  checkoutIntentId: ctx.checkoutIntentId,
                  source: token,
                  sourceType: "CARD",
                  cardholderName,
                  customer: customer ?? {},
                  metadata: ctx.metadata,
                  threeds: { source: "CLOVER", browserInfo },
                }),
              }),
              20000,
              "apiFetch /clover/pay/online/card-token",
            );

            if (!paymentResponse?.orderStableId) {
              throw new Error(
                locale === "zh"
                  ? "支付处理中或失败，请返回结算页重试。"
                  : "Payment is processing/failed. Please go back and try again.",
              );
            }

            cloverGoogleRef.current?.updateGooglePaymentStatus?.("success");
            window.sessionStorage.removeItem(GOOGLE_PAY_CTX_KEY);
            router.replace(`/${locale}/thank-you/${paymentResponse.orderStableId}`);
          } catch (payError) {
            console.error("[GP] pay error", toSafeErrorLog(payError));
            cloverGoogleRef.current?.updateGooglePaymentStatus?.("failed");
            setError(
              locale === "zh"
                ? "Google Pay 支付失败，请返回结算页重试。"
                : "Google Pay failed. Please go back and try again.",
            );
            submittedTokenRef.current = null;
          }
        });
      } catch (initError) {
        console.error("[GP] init error", toSafeErrorLog(initError));
        setError(
          locale === "zh"
            ? "Google Pay 初始化失败，请返回结算页重试。"
            : "Failed to initialize Google Pay. Please go back and try again.",
        );
      }
    };

    void init();

    return () => {
      cancelled = true;
      googlePayRef.current?.destroy?.();
      googlePayRef.current = null;
      cloverGoogleRef.current = null;
      submittedTokenRef.current = null;
    };
  }, [ctx, locale, router]);

  if (loading) {
    return (
      <div className="mx-auto max-w-lg p-6 text-sm text-slate-600">
        {locale === "zh" ? "正在加载 Google Pay…" : "Loading Google Pay…"}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-lg font-semibold text-slate-900">
        {locale === "zh" ? "Google Pay 支付" : "Pay with Google Pay"}
      </h1>

      {ctx ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <div className="flex items-center justify-between">
            <span>{locale === "zh" ? "本次支付金额" : "Total"}</span>
            <span className="font-semibold">
              {currencyFormatter.format(ctx.totalCents / 100).replace(/^CA\$\s?/, "$")}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            {locale === "zh"
              ? "金额已按优惠券/积分/配送费/税重新计算。"
              : "Total reflects coupons/points/delivery/tax."}
          </p>
        </div>
      ) : null}

      <div
        id="clover-google-pay"
        className="h-12 overflow-hidden rounded-2xl border border-slate-200 bg-white"
      />

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => router.replace(`/${locale}/checkout`)}
        className="w-full rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        {locale === "zh" ? "返回结算页" : "Back to checkout"}
      </button>
    </div>
  );
}
