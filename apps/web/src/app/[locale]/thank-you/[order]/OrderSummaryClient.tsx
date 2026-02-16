// apps/web/src/app/[locale]/thank-you/[order]/OrderSummaryClient.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import type { Locale } from "@/lib/i18n/locales";
import type { OrderItemOptionsSnapshot } from "@/lib/order/order-item-options";

type OrderSummaryLineItem = {
  productStableId: string;
  name: string;
  nameEn: string | null;
  nameZh: string | null;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
  optionsJson?: OrderItemOptionsSnapshot | Record<string, unknown> | null;
};

type OrderSummaryResponse = {
  orderId: string;
  orderStableId: string;
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

type PrepTimeResponse = {
  minutes: number;
};

type Props = {
  orderStableId: string;
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

export function OrderSummaryClient({ orderStableId, locale }: Props) {
  const [data, setData] = useState<OrderSummaryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [prepTimeMinutes, setPrepTimeMinutes] = useState<number | null>(null);

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

  const resolveItemName = (item: OrderSummaryLineItem) => {
    if (locale === "zh") {
      return item.nameZh ?? item.name;
    }

    return item.nameEn ?? item.name;
  };

  const resolveOptionLabel = (
    nameZh: string | null,
    nameEn: string,
  ) => (locale === "zh" ? nameZh ?? nameEn : nameEn);

  const renderOptions = (options?: OrderSummaryLineItem["optionsJson"]) => {
    if (!options || !Array.isArray(options) || options.length === 0) return null;

    return (
      <ul className="mt-1 space-y-0.5 text-[11px] text-slate-500">
        {options.map((group) => (
          <li key={group.templateGroupStableId}>
            <div className="font-medium text-slate-700">
              {resolveOptionLabel(group.nameZh, group.nameEn)}
            </div>
            <ul className="ml-3 list-disc space-y-0.5">
              {group.choices.map((choice) => (
                <li
                  key={choice.stableId}
                  className="flex items-center justify-between gap-2"
                >
                  <span>
                    {resolveOptionLabel(choice.nameZh, choice.nameEn)}
                  </span>
                  {choice.priceDeltaCents !== 0 && (
                    <span className="whitespace-nowrap">
                      {choice.priceDeltaCents > 0 ? "+" : "-"}$
                      {Math.abs(choice.priceDeltaCents / 100).toFixed(2)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    );
  };

  useEffect(() => {
    let cancelled = false;

    const fetchPrepTime = async () => {
      try {
        const response = await apiFetch<PrepTimeResponse>("/orders/prep-time");
        if (!cancelled) {
          setPrepTimeMinutes(response.minutes);
        }
      } catch {
        if (!cancelled) {
          setPrepTimeMinutes(null);
        }
      }
    };

    fetchPrepTime();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!orderStableId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let attempts = 0;
    
    // 配置：最多重试 20 次，每次间隔 1 秒 (共等待约 20秒)
    const MAX_ATTEMPTS = 20; 
    const RETRY_INTERVAL_MS = 1000; 

    const fetchOrder = async () => {
      try {
        // 只在第一次请求时重置 error，避免重试过程中闪烁
        if (attempts === 0) {
          setError(null);
          setLoading(true);
        }

        const summary = await apiFetch<OrderSummaryResponse>(
          `/orders/${encodeURIComponent(orderStableId)}/summary`,
        );

        if (!cancelled) {
          setData(summary);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (cancelled) return;

        // 核心逻辑：如果还没达到最大重试次数，就等待后重试
        // 注意：这里我们假设 apiFetch 在 404 时会抛出异常
        // 如果你的 apiFetch 返回 status，你需要相应调整判断逻辑
        if (attempts < MAX_ATTEMPTS) {
          attempts++;
          setTimeout(fetchOrder, RETRY_INTERVAL_MS);
        } else {
          // 超过最大重试次数，彻底放弃
          const msg =
            err instanceof Error ? err.message : labels.failed;
          setError(msg);
          setLoading(false);
        }
      }
    };

    fetchOrder();

    return () => {
      cancelled = true;
    };
  }, [orderStableId, labels.failed]);

  if (!orderStableId) return null;

  return (
    <>
      {data ? (
        <div className="mx-auto mb-8 max-w-md rounded-2xl border bg-white p-6 text-center sm:p-8">
          <div className="text-sm text-slate-500 mb-2">
            {locale === "zh" ? "订单编号" : "Order number"}
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold tracking-wider">
            {data.orderNumber}
          </div>
          {data.orderNumber.length >= 4 ? (
            <p className="mt-2 text-sm text-slate-700">
              {locale === "zh"
                ? `取餐码：${data.orderNumber.slice(-4)}（订单编号的后四位）`
                : `Pickup code: ${data.orderNumber.slice(-4)} (last 4 digits of your order number)`}
            </p>
          ) : null}
          <p className="mt-3 text-xs text-slate-500">
            {locale === "zh"
              ? "请保存此页面，方便取餐或配送查询。"
              : "Please save this page for pickup or delivery reference."}
          </p>
        </div>
      ) : null}

      <section className="mx-auto mt-4 max-w-xl rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-700 sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">
          {labels.heading}
        </h2>

        {prepTimeMinutes ? (
          <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs text-orange-700">
            {locale === "zh"
              ? `您的订单已提交。目前平均制作时间为 ${prepTimeMinutes} 分钟，请留意短信通知。`
              : `Your order is confirmed. Avg prep time is ${prepTimeMinutes} mins. Please watch for SMS updates.`}
          </div>
        ) : null}

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
                {data.lineItems.map((item, index) => (
                  <li
                    key={
                      item.productStableId +
                      "-" +
                      item.name +
                      "-" +
                      item.quantity +
                      "-" +
                      index
                    }
                    className="flex items-start justify-between gap-4 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">
                        {resolveItemName(item)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        × {item.quantity}
                      </p>
                      {renderOptions(item.optionsJson)}
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
    </>
  );
}
