//Users/apple/sanqinMVP/apps/web/src/app/[locale]/order/[id]/page.tsx
'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api/client';
import { fetchOrderById } from '@/lib/api/pos';
import { isStableId } from '@shared/menu';
import { ORDER_STATUS_SEQUENCE, OrderStatus } from '@shared/order';
import type {
  DeliveryProviderOption,
  DeliveryTypeOption,
} from '@/lib/order/shared';
import type { Locale } from '@/lib/i18n/locales';
import type { OrderItemOptionsSnapshot } from '@/lib/order/order-item-options';

type FullOrderItem = {
  productStableId: string;
  displayName: string | null;
  nameEn: string | null;
  nameZh: string | null;
  qty: number;
  unitPriceCents: number | null;
  optionsJson: OrderItemOptionsSnapshot | Record<string, unknown> | null;
};

type FullOrder = {
  orderStableId?: string;
  status: OrderStatus;
  channel: string;
  paymentMethod: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  fulfillmentType: string;
  pickupCode: string | null;
  clientRequestId: string | null;
  deliveryType: DeliveryTypeOption | null;
  deliveryProvider: DeliveryProviderOption | null;
  deliveryFeeCents: number | null;
  deliveryEtaMinMinutes: number | null;
  deliveryEtaMaxMinutes: number | null;
  externalDeliveryId: string | null;
  createdAt: string;
  items: FullOrderItem[];
  loyaltyRedeemCents: number | null;
  subtotalAfterDiscountCents: number | null;
  balancePaidCents?: number | null;
  pointsEarned?: number | null;
  couponStableId: string | null;
  couponDiscountCents: number | null;
  couponCodeSnapshot: string | null;
  couponTitleSnapshot: string | null;
};

type PublicSummaryItem = {
  productStableId: string;
  name: string;
  nameEn: string | null;
  nameZh: string | null;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
  optionsJson?: OrderItemOptionsSnapshot | null;
};

type PublicSummary = {
  orderStableId: string;
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  fulfillmentType: string;
  itemCount: number;
  currency: 'CAD';
  subtotalCents: number;
  taxCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  loyaltyRedeemCents?: number | null;
  couponDiscountCents?: number | null;
  subtotalAfterDiscountCents?: number | null;
  balancePaidCents?: number | null;
  pointsEarned?: number | null;
  lineItems: PublicSummaryItem[];
};

type PageParams = {
  id?: string;
  locale?: string;
};

type PageProps = {
  params: Promise<PageParams>;
};

function formatOrderStatus(status: OrderStatus, isZh: boolean): string {
  const zh: Record<OrderStatus, string> = {
    pending: '待支付',
    paid: '已支付',
    making: '制作中',
    ready: '待取餐',
    completed: '已完成',
    refunded: '已退款',
  };
  const en: Record<OrderStatus, string> = {
    pending: 'Pending',
    paid: 'Paid',
    making: 'In progress',
    ready: 'Ready',
    completed: 'Completed',
    refunded: 'Refunded',
  };
  return isZh ? zh[status] : en[status];
}

function formatPaymentMethod(value: string | null, isZh: boolean): string {
  if (!value) return isZh ? "未知" : "Unknown";
  const map: Record<string, { zh: string; en: string }> = {
    CASH: { zh: "现金", en: "Cash" },
    CARD: { zh: "刷卡", en: "Card" },
    WECHAT_ALIPAY: { zh: "微信/支付宝", en: "WeChat/Alipay" },
    STORE_BALANCE: { zh: "储值余额", en: "Store balance" },
  };
  const hit = map[value];
  return hit ? (isZh ? hit.zh : hit.en) : value;
}

export default function OrderDetailPage({ params }: PageProps) {
  const { id: orderIdRaw, locale: localeRaw } = use(params);
  const orderId = orderIdRaw ?? '';
  const locale = (localeRaw ?? 'en') as Locale;
  const isZh = locale === 'zh';
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPosSource = searchParams.get('source') === 'pos';
  const [order, setOrder] = useState<FullOrder | PublicSummary | null>(null);
  const [isFullDetail, setIsFullDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!isStableId(orderId)) {
        setError(
          isZh
            ? '无效的订单 ID（需为 cuid）'
            : 'Invalid order id (must be cuid)',
        );
        setLoading(false);
        return;
      }
      try {
        setError(null);
        const data = isPosSource
          ? await fetchOrderById<FullOrder>(orderId)
          : await apiFetch<FullOrder>(`/orders/${orderId}`);
        if (!cancelled) {
          setOrder(data);
          setIsFullDetail(true);
          setLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        const apiError = err instanceof ApiError ? err : null;
        if (apiError?.status !== 401 && apiError?.status !== 403) {
          setError(apiError?.message ?? '订单详情加载失败');
          setLoading(false);
          return;
        }

        try {
          const posOrder = await fetchOrderById<FullOrder>(orderId);
          if (!cancelled) {
            setOrder(posOrder);
            setIsFullDetail(true);
            setLoading(false);
            return;
          }
        } catch {
          // fallthrough to public summary
        }

        try {
          const summary = await apiFetch<PublicSummary>(
            `/orders/${orderId}/summary`,
          );
          if (!cancelled) {
            setOrder(summary);
            setIsFullDetail(false);
            setLoading(false);
          }
        } catch (summaryErr) {
          if (!cancelled)
            setError(
              summaryErr instanceof Error
                ? summaryErr.message
                : '订单不存在或无法查看',
            );
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [isPosSource, isZh, orderId]);

  useEffect(() => {
    setCanGoBack(window.history.length > 1);
  }, []);

  const handleBack = () => {
    if (canGoBack) {
      router.back();
      return;
    }

    router.push(`/${locale}/membership`);
  };

  const statusIndex = useMemo(() => {
    if (!order) return -1;
    return ORDER_STATUS_SEQUENCE.indexOf(order.status);
  }, [order]);
  const fullOrder = isFullDetail ? (order as FullOrder) : null;
  const summaryOrder = !isFullDetail ? (order as PublicSummary) : null;
  const paymentLabel = formatPaymentMethod(fullOrder?.paymentMethod ?? null, isZh);
  const manualDiscountCents = useMemo(() => {
    const subtotal = order?.subtotalCents ?? 0;
    const subtotalAfterDiscount = order?.subtotalAfterDiscountCents;
    if (typeof subtotalAfterDiscount !== 'number') return 0;
    const totalDiscount = Math.max(0, subtotal - subtotalAfterDiscount);
    const couponDiscount = Math.max(0, order?.couponDiscountCents ?? 0);
    const loyaltyDiscount = Math.max(0, order?.loyaltyRedeemCents ?? 0);
    return Math.max(0, totalDiscount - couponDiscount - loyaltyDiscount);
  }, [order]);

  const renderOptions = (
    rawOptions: FullOrderItem['optionsJson'] | PublicSummaryItem['optionsJson'],
  ) => {
    if (!rawOptions) return null;

    if (!Array.isArray(rawOptions)) {
      return (
        <pre className="mt-1 whitespace-pre-wrap break-words text-[11px] text-gray-500">
          {JSON.stringify(rawOptions, null, 2)}
        </pre>
      );
    }

    if (rawOptions.length === 0) return null;

    return (
      <div className="mt-2 space-y-1 text-xs text-gray-600">
        {rawOptions.map((group, index) => (
          <div key={`${group.templateGroupStableId}-${index}`}>
            <div className="font-medium text-gray-700">
              {isZh ? (group.nameZh ?? group.nameEn) : group.nameEn}
            </div>
            <ul className="ml-4 mt-1 list-disc space-y-0.5 text-[11px] text-gray-600">
              {group.choices.map((choice) => (
                <li
                  key={choice.stableId}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="break-words">
                    {isZh ? (choice.nameZh ?? choice.nameEn) : choice.nameEn}
                  </span>
                  {choice.priceDeltaCents !== 0 && (
                    <span className="whitespace-nowrap text-gray-500">
                      {choice.priceDeltaCents > 0 ? '+' : '-'}$
                      {Math.abs(choice.priceDeltaCents / 100).toFixed(2)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  };

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
<div className="flex items-center justify-between">
  <div>
    <h1 className="text-2xl font-semibold">{isZh ? '订单详情' : 'Order details'}</h1>
  </div>
  <button
    type="button"
    className="flex min-w-[3rem] flex-col items-center justify-center text-sm leading-tight text-blue-600 hover:underline"
    onClick={handleBack}
  >
    <span aria-hidden="true">←</span>
    <span>{isZh ? '返回' : 'Back'}</span>
  </button>
</div>

      {loading && <div className="text-gray-500">加载中…</div>}
      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {order && !loading && !error && (
        <section className="space-y-4 rounded-lg border p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-4">
            <span className="rounded bg-gray-900 px-2 py-1 text-xs font-medium uppercase tracking-wide text-white">
              {formatOrderStatus(order.status, isZh)}
            </span>
            <span className="text-sm text-gray-600">
              {isZh ? '订单编号：' : 'Order Number: '}
              {isFullDetail
                ? fullOrder?.clientRequestId ?? fullOrder?.orderStableId ?? orderId
                : summaryOrder?.orderNumber ?? summaryOrder?.orderStableId ?? orderId}
            </span>
            <span className="text-sm text-gray-600">
              {isZh ? '履约方式：' : 'Fulfillment: '}
              {order.fulfillmentType}
            </span>
            <span className="text-sm text-gray-500">
              创建时间：{new Date(order.createdAt).toLocaleString()}
            </span>
          </div>

<div className="space-y-2">
  <h2 className="text-sm font-semibold text-gray-700">金额</h2>
  <ul className="text-sm text-gray-600">
    <li>小计：${(order.subtotalCents / 100).toFixed(2)}</li>

    {typeof order.loyaltyRedeemCents === "number" &&
      order.loyaltyRedeemCents > 0 && (
        <li>
          积分抵扣：
          <span className="text-emerald-700">
            -${(order.loyaltyRedeemCents / 100).toFixed(2)}
          </span>
          {typeof order.subtotalAfterDiscountCents === "number" && (
            <span className="ml-2 text-xs text-gray-500">
              （折后小计：$
              {(order.subtotalAfterDiscountCents / 100).toFixed(2)}
              ）
            </span>
          )}
        </li>
      )}
  {/* ⭐ 新增：优惠券使用情况 */}
  {typeof order.couponDiscountCents === 'number' &&
    order.couponDiscountCents > 0 && (
      <li>
        优惠券：
        <span className="text-amber-700">
          -${(order.couponDiscountCents / 100).toFixed(2)}
        </span>
      </li>
    )}

    {manualDiscountCents > 0 && (
      <li>
        {isZh ? '折扣/优惠：' : 'Discount:'}
        <span className="text-amber-700">-${(manualDiscountCents / 100).toFixed(2)}</span>
      </li>
    )}

    {typeof order.balancePaidCents === "number" && order.balancePaidCents > 0 && (
      <li>
        余额支付：
        <span className="text-indigo-700">
          -${(order.balancePaidCents / 100).toFixed(2)}
        </span>
      </li>
    )}

    {typeof order.pointsEarned === "number" && order.pointsEarned !== 0 && (
      <li>
        积分赚取：
        <span className="text-sky-700">+{order.pointsEarned.toFixed(2)} pts</span>
      </li>
    )}
    <li>税额：${(order.taxCents / 100).toFixed(2)}</li>
    {typeof order.deliveryFeeCents === "number" &&
      order.deliveryFeeCents > 0 && (
        <li>配送费：${(order.deliveryFeeCents / 100).toFixed(2)}</li>
      )}
    <li className="font-medium text-gray-900">
      合计：${(order.totalCents / 100).toFixed(2)}
    </li>
    {isFullDetail && fullOrder ? (
      <li>
        {isZh ? "支付方式：" : "Payment method: "}
        <span className="text-gray-700">{paymentLabel}</span>
      </li>
    ) : null}
  </ul>
</div>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-700">状态流转</h2>
            <ol className="flex flex-wrap gap-2 text-xs text-gray-500">
              {ORDER_STATUS_SEQUENCE.map((status, idx) => (
                <li
                  key={status}
                  className={`rounded-full border px-3 py-1 ${
                    idx <= statusIndex
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200'
                  }`}
                >
                  {status}
                </li>
              ))}
            </ol>
          </div>

          {isFullDetail && fullOrder ? (
            <>
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-gray-700">配送信息</h2>
                <ul className="text-sm text-gray-600">
                  {fullOrder.deliveryType && (
                    <li>
                      类型：
                      {DELIVERY_TYPE_LABELS[fullOrder.deliveryType]} (
                      {fullOrder.deliveryType})
                    </li>
                  )}
                  {fullOrder.deliveryProvider && (
                    <li>
                      平台：
                      {DELIVERY_PROVIDER_LABELS[fullOrder.deliveryProvider]} (
                      {fullOrder.deliveryProvider})
                    </li>
                  )}
                  {typeof fullOrder.deliveryFeeCents === 'number' && (
                    <li>
                      配送费：${(fullOrder.deliveryFeeCents / 100).toFixed(2)}
                    </li>
                  )}
                  {typeof fullOrder.deliveryEtaMinMinutes === 'number' &&
                    typeof fullOrder.deliveryEtaMaxMinutes === 'number' && (
                      <li>
                        ETA：{fullOrder.deliveryEtaMinMinutes}–
                        {fullOrder.deliveryEtaMaxMinutes} 分钟
                      </li>
                    )}
                  {fullOrder.externalDeliveryId && (
                    <li>外部单号：{fullOrder.externalDeliveryId}</li>
                  )}
                </ul>
              </div>

              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-gray-700">项目列表</h2>
                <ul className="space-y-2 text-sm text-gray-700">
                  {fullOrder.items.map((item, idx) => {
                    const unitPrice =
                      typeof item.unitPriceCents === 'number'
                        ? item.unitPriceCents
                        : null;
                    const lineTotal =
                      unitPrice !== null ? unitPrice * item.qty : null;
                    const displayName = isZh
                      ? item.nameZh || item.displayName || item.nameEn || item.productStableId
                      : item.nameEn || item.displayName || item.nameZh || item.productStableId;

                    const itemKey = `${item.productStableId ?? displayName ?? 'item'}-${idx}`;

                    return (
                      <li key={itemKey} className="rounded border px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-medium text-gray-900">
                              {displayName}
                            </div>
                            <div className="text-xs text-gray-500 break-all">
                              {item.productStableId}
                            </div>
                          </div>
                          <div className="text-right text-sm text-gray-700">
                            <div>×{item.qty}</div>
                            {unitPrice !== null && (
                              <div className="text-xs text-gray-500">
                                单价：${(unitPrice / 100).toFixed(2)}
                              </div>
                            )}
                          </div>
                        </div>
                        {lineTotal !== null && (
                          <div className="mt-1 text-xs text-gray-600">
                            小计：${(lineTotal / 100).toFixed(2)}
                          </div>
                        )}
                        {renderOptions(item.optionsJson)}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          ) : summaryOrder ? (
            <div className="space-y-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <p>
                {isZh
                  ? `已展示公开摘要（${summaryOrder.itemCount} 件商品）`
                  : `Public summary only (${summaryOrder.itemCount} items)`}
              </p>
              <ul className="space-y-2 text-sm text-gray-700">
                {summaryOrder.lineItems.map((item, idx) => {
                  const itemKey = `${item.productStableId}-${idx}`;
                  const displayName = isZh
                    ? item.nameZh || item.name || item.nameEn || item.productStableId
                    : item.nameEn || item.name || item.nameZh || item.productStableId;
                  return (
                    <li key={itemKey} className="rounded border border-slate-200 bg-white px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-gray-900">{displayName}</div>
                          <div className="text-xs text-gray-500 break-all">{item.productStableId}</div>
                        </div>
                        <div className="text-right text-sm text-gray-700">
                          <div>×{item.quantity}</div>
                          <div className="text-xs text-gray-500">单价：${(item.unitPriceCents / 100).toFixed(2)}</div>
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-gray-600">小计：${(item.totalPriceCents / 100).toFixed(2)}</div>
                      {renderOptions(item.optionsJson)}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <div className="text-xs text-gray-500 break-words">
            深链规范：<code className="rounded bg-gray-100 px-1 py-0.5 break-all whitespace-normal">sanqin://order/{orderId}</code>
          </div>
        </section>
      )}
    </main>
  );
}

const DELIVERY_TYPE_LABELS: Record<DeliveryTypeOption, string> = {
  STANDARD: 'Standard',
  PRIORITY: 'Priority',
};

const DELIVERY_PROVIDER_LABELS: Record<DeliveryProviderOption, string> = {
  UBER: 'Uber',
};
