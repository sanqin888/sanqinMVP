// apps/web/src/app/[locale]/thank-you/[order]/OrderSummaryClient.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { Locale } from "@/lib/i18n/locales";

type OrderSummaryLineItem = {
  productId: string;
  name: string;
  nameEn: string | null;
  nameZh: string | null;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
  optionsJson?: unknown;
};

type OrderSummaryResponse = {
  orderId: string;
  clientRequestId: string | null;
  orderNumber: string;
  currency: string;
  subtotalCents: number;
  taxCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  lineItems: OrderSummaryLineItem[];
  loyaltyRedeemCents?: number | null;
  subtotalAfterDiscountCents?: number | null;
  couponDiscountCents?: number | null;
};

type Props = {
  orderNumber: string;
  locale: Locale;
};

const LABELS: Record<
  Locale,
  {
    heading: string;
    itemsTitle: string;
    subtotal: string;
    deliveryFee: string;
    tax: string;
    discount: string;
    total: string;
    loading: string;
    failed: string;
  }
> = {
  en: {
    heading: "Order summary",
    itemsTitle: "Items",
    subtotal: "Subtotal",
    deliveryFee: "Delivery fee",
    tax: "Tax",
    discount: "Discount",
    total: "Total",
    loading: "Loading your order summary…",
    failed: "Failed to load order summary. If this persists, please contact us.",
  },
  zh: {
    heading: "订单小结",
    itemsTitle: "菜品明细",
    subtotal: "小计",
    deliveryFee: "配送费",
    tax: "税费",
    discount: "优惠/积分抵扣",
    total: "合计",
    loading: "正在加载订单小结…",
    failed: "订单小结加载失败，如多次刷新仍有问题，请联系客服。",
  },
};

export function OrderSummaryClient({ orderNumber, locale }: Props) {
  const [data, setData] = useState<OrderSummaryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const labels = LABELS[locale];

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale === "zh" ? "zh-Hans-CA" : "en-CA", {
        style: "currency",
        currency: (data?.currency as string) || "CAD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [locale, data?.currency],
  );

  const centsToMoney = (value: number) =>
    currencyFormatter.format(value / 100).replace(/^CA\$\s?/, "$");

  useEffect(() => {
    if (!orderNumber) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const summary = await apiFetch<OrderSummaryResponse>(
          `/orders/${encodeURIComponent(orderNumber)}/summary`,
        );

        if (!cancelled) {
          setData(summary);
        }
      } catch (err) {
        if (!cancelled) {
          const msg =
            err instanceof Error ? err.message : labels.failed;
          setError(msg);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderNumber, labels.failed]);

  if (!orderNumber) return null;

  return (
    <section className="mx-auto mt-4 max-w-xl rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-700 sm:p-6">
      <h2 className="text-base font-semibold text-slate-900">
        {labels.heading}
      </h2>

      {loading ? (
        <p className="mt-3 text-xs text-slate-500">{labels.loading}</p>
      ) : error ? (
        <p className="mt-3 text-xs text-red-600">{error}</p>
      ) : !data ? null : (
        <>
          {/* 菜品列表 */}
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {labels.itemsTitle}
            </p>
            <ul className="mt-2 space-y-2">
              {data.lineItems.map((item) => (
                <li
                  key={item.productId + "-" + item.name + "-" + item.quantity}
                  className="flex items-start justify-between gap-4 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">
                      {item.name}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      × {item.quantity}
                    </p>
                  </div>
                  <div className="whitespace-nowrap text-right font-medium text-slate-900">
                    {centsToMoney(item.totalPriceCents)}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* 金额小结 */}
          <div className="mt-4 space-y-1 border-t border-slate-200 pt-3 text-xs">
            {/* 小计（未扣积分） */}
            <div className="flex items-center justify-between">
              <span>{labels.subtotal}</span>
              <span>{centsToMoney(data.subtotalCents)}</span>
            </div>

            {/* 优惠券折扣 */}
            {(data.couponDiscountCents ?? 0) > 0 && (
              <div className="flex items-center justify-between text-amber-700">
                <span>{locale === "zh" ? "优惠券" : "Coupon"}</span>
                <span>
                  -{centsToMoney(data.couponDiscountCents ?? 0)}
                </span>
              </div>
            )}

            {/* 积分抵扣 */}
            {(data.loyaltyRedeemCents ?? 0) > 0 && (
              <div className="flex items-center justify-between text-emerald-700">
                <span>{locale === "zh" ? "积分抵扣" : "Points redeemed"}</span>
                <span>
                  -{centsToMoney(data.loyaltyRedeemCents ?? 0)}
                </span>
              </div>
            )}

            {/* 其他折扣（如果有统一 discountCents 但 coupon/points 都没单独拆开） */}
            {(data.discountCents ?? 0) > 0 &&
              (data.couponDiscountCents ?? 0) === 0 &&
              (data.loyaltyRedeemCents ?? 0) === 0 && (
                <div className="flex items-center justify-between text-amber-700">
                  <span>{labels.discount}</span>
                  <span>-{centsToMoney(data.discountCents)}</span>
                </div>
              )}

            {/* 配送费 */}
            {data.deliveryFeeCents > 0 && (
              <div className="flex items-center justify-between">
                <span>{labels.deliveryFee}</span>
                <span>{centsToMoney(data.deliveryFeeCents)}</span>
              </div>
            )}

            {/* 税 */}
            <div className="flex items-center justify-between">
              <span>{labels.tax}</span>
              <span>{centsToMoney(data.taxCents)}</span>
            </div>

            {/* 合计 */}
            <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-sm font-semibold text-slate-900">
              <span>{labels.total}</span>
              <span>{centsToMoney(data.totalCents)}</span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
