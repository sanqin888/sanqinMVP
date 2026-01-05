//Users/apple/sanqinMVP/apps/web/src/app/[locale]/order/[id]/page.tsx
'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api/client';
import { isStableId } from '@/lib/stable-id';
import { ORDER_STATUS_SEQUENCE, type OrderStatus } from '@shared/order';
import type {
  DeliveryProviderOption,
  DeliveryTypeOption,
  Locale,
} from '@/lib/order/shared';
import type { OrderItemOptionsSnapshot } from '@/lib/order/order-item-options';

type OrderItem = {
  id: string;
  productStableId: string;
  displayName: string | null;
  nameEn: string | null;
  nameZh: string | null;
  qty: number;
  unitPriceCents: number | null;
  optionsJson: OrderItemOptionsSnapshot | Record<string, unknown> | null;
};

type OrderDetail = {
  id: string;
  status: OrderStatus;
  channel: string;
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
  items: OrderItem[];
  loyaltyRedeemCents: number | null;           
  subtotalAfterDiscountCents: number | null;   
  couponStableId: string | null;
  couponDiscountCents: number | null;
  couponCodeSnapshot: string | null;
  couponTitleSnapshot: string | null;
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

export default function OrderDetailPage({ params }: PageProps) {
  const { id: orderIdRaw, locale: localeRaw } = use(params);
  const orderId = orderIdRaw ?? '';
  const locale = (localeRaw ?? 'en') as Locale;
  const isZh = locale === 'zh';
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
        const data = await apiFetch<OrderDetail>(`/orders/${orderId}`);
        if (!cancelled) setOrder(data);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : '订单详情加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [isZh, orderId]);

  const statusIndex = useMemo(() => {
    if (!order) return -1;
    return ORDER_STATUS_SEQUENCE.indexOf(order.status);
  }, [order]);

  const hasDeliveryInfo = Boolean(
    order?.deliveryType ||
      order?.deliveryFeeCents ||
      order?.externalDeliveryId ||
      (order?.deliveryEtaMinMinutes && order?.deliveryEtaMaxMinutes),
  );

  const renderOptions = (rawOptions: OrderItem['optionsJson']) => {
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
        {rawOptions.map((group) => (
          <div key={group.templateGroupStableId}>
            <div className="font-medium text-gray-700">
              {group.nameZh ?? group.nameEn}
            </div>
            <ul className="ml-4 mt-1 list-disc space-y-0.5 text-[11px] text-gray-600">
              {group.choices.map((choice) => (
                <li
                  key={choice.stableId}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="break-words">
                    {choice.nameZh ?? choice.nameEn}
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
    <p className="text-sm text-gray-500 break-all">ID: {orderId}</p>
  </div>
  <Link
    href={`/${locale}/membership`}
    className="text-sm text-blue-600 hover:underline"
  >
    ← 返回会员中心
  </Link>
</div>

      {loading && <div className="text-gray-500">加载中…</div>}
      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {order && !loading && !error && (
        <section className="space-y-4 rounded-lg border p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-4">
            <span className="rounded bg-gray-900 px-2 py-1 text-xs font-medium uppercase tracking-wide text-white">
              {formatOrderStatus(order.status, isZh)}
            </span>
            {order.clientRequestId && (
              <span className="text-sm text-gray-600">
                {isZh ? '订单编号：' : 'Order Number: '}
                {order.clientRequestId}
              </span>
            )}
            <span className="text-sm text-gray-600">
              渠道：{order.channel} · {order.fulfillmentType}
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
        <span className="mr-2">
          {/* 标题 + ID 二选一/叠加展示 */}
          {order.couponTitleSnapshot ?? '优惠券'}
        </span>
        <span className="text-amber-700">
          -${(order.couponDiscountCents / 100).toFixed(2)}
        </span>
      </li>
    )}

    <li>税额：${(order.taxCents / 100).toFixed(2)}</li>
    <li className="font-medium text-gray-900">
      合计：${(order.totalCents / 100).toFixed(2)}
    </li>
  </ul>
</div>

          {hasDeliveryInfo && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-700">配送信息</h2>
              <ul className="text-sm text-gray-600">
                {order.deliveryType && (
                  <li>
                    类型：
                    {DELIVERY_TYPE_LABELS[order.deliveryType]} ({order.deliveryType})
                  </li>
                )}
                {order.deliveryProvider && (
                  <li>
                    平台：
                    {DELIVERY_PROVIDER_LABELS[order.deliveryProvider]} (
                    {order.deliveryProvider})
                  </li>
                )}
                {typeof order.deliveryFeeCents === 'number' && (
                  <li>配送费：${(order.deliveryFeeCents / 100).toFixed(2)}</li>
                )}
                {typeof order.deliveryEtaMinMinutes === 'number' &&
                  typeof order.deliveryEtaMaxMinutes === 'number' && (
                    <li>
                      ETA：{order.deliveryEtaMinMinutes}–{order.deliveryEtaMaxMinutes} 分钟
                    </li>
                  )}
                {order.externalDeliveryId && (
                  <li>外部单号：{order.externalDeliveryId}</li>
                )}
              </ul>
            </div>
          )}

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

          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-700">项目列表</h2>
            <ul className="space-y-2 text-sm text-gray-700">
              {order.items.map((item, idx) => {
                const unitPrice =
                  typeof item.unitPriceCents === 'number'
                    ? item.unitPriceCents
                    : null;
                const lineTotal =
                  unitPrice !== null ? unitPrice * item.qty : null;
                const displayName =
                  item.displayName ||
                  item.nameZh ||
                  item.nameEn ||
                  item.productStableId;

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

          <div className="text-xs text-gray-500">
            深链规范：<code className="rounded bg-gray-100 px-1 py-0.5">sanqin://order/{orderId}</code>
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
  DOORDASH: 'DoorDash',
  UBER: 'Uber',
};
