'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Truck,
} from 'lucide-react';
import { apiFetch, getApiErrorMessage } from '@/lib/api/client';
import type { Locale } from '@/lib/i18n/locales';
import {
  DeliveryDispatchReconciliationCard,
  type DeliveryDispatchReconciliationAction,
  type DeliveryDispatchReconciliationItem,
} from './reconciliation-card';

type ReconciliationResult = {
  orderStableId: string;
  attempt: number;
  action: DeliveryDispatchReconciliationAction;
  nextAttempt?: number;
  externalDeliveryId?: string;
};

const UBER_DIRECT_DASHBOARD_URL = 'https://direct.uber.com/';

function itemKey(item: DeliveryDispatchReconciliationItem): string {
  return `${item.orderStableId}:${item.attempt}`;
}

export default function AdminDeliveryDispatchPage() {
  const { locale } = useParams<{ locale: Locale }>();
  const searchParams = useSearchParams();
  const isZh = locale === 'zh';
  const focusedOrderStableId = searchParams.get('order')?.trim() ?? '';

  const [items, setItems] = useState<DeliveryDispatchReconciliationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiFetch<DeliveryDispatchReconciliationItem[]>(
        '/admin/orders/delivery-dispatch/reconciliation?limit=100',
      );
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      setLoadError(
        getApiErrorMessage(
          error,
          isZh
            ? '加载配送异常队列失败。'
            : 'Failed to load delivery reconciliation queue.',
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [isZh]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const orderedItems = useMemo(() => {
    if (!focusedOrderStableId) return items;
    return [...items].sort((left, right) => {
      const leftFocused = left.orderStableId === focusedOrderStableId ? 1 : 0;
      const rightFocused = right.orderStableId === focusedOrderStableId ? 1 : 0;
      return rightFocused - leftFocused;
    });
  }, [focusedOrderStableId, items]);

  async function reconcile(params: {
    item: DeliveryDispatchReconciliationItem;
    action: DeliveryDispatchReconciliationAction;
    providerDeliveryId?: string;
    note?: string;
  }): Promise<void> {
    const { item, action, providerDeliveryId, note } = params;
    const key = itemKey(item);
    setActionTarget(key);
    setActionError(null);
    setSuccess(null);

    try {
      const result = await apiFetch<ReconciliationResult>(
        `/admin/orders/delivery-dispatch/${encodeURIComponent(
          item.orderStableId,
        )}/reconcile`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            attempt: item.attempt,
            action,
            providerDeliveryId,
            note,
          }),
        },
      );

      setSuccess(
        action === 'BIND_EXISTING'
          ? isZh
            ? `订单 ${item.orderNumber} 已完成 Uber 配送绑定核对：${result.externalDeliveryId ?? providerDeliveryId ?? ''}。`
            : `Order ${item.orderNumber} Uber delivery binding is reconciled: ${result.externalDeliveryId ?? providerDeliveryId ?? ''}.`
          : isZh
            ? `订单 ${item.orderNumber} 已授权重新派单，新的 attempt ${result.nextAttempt ?? item.attempt + 1} 将由 durable worker 处理。`
            : `Order ${item.orderNumber} was authorized for retry. Durable worker will process attempt ${result.nextAttempt ?? item.attempt + 1}.`,
      );
      await loadQueue();
    } catch (error) {
      setActionError(
        getApiErrorMessage(
          error,
          isZh ? '配送异常处理失败。' : 'Failed to reconcile delivery dispatch.',
        ),
      );
    } finally {
      setActionTarget(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-2 sm:p-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Uber Direct
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">
            {isZh ? '配送异常处理' : 'Delivery reconciliation'}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {isZh
              ? '这里只显示需要人工处理的 FAILED / UNKNOWN 派单。UNKNOWN 绝不会自动重新向 Uber 建单。'
              : 'Only FAILED / UNKNOWN dispatches requiring manual action appear here. UNKNOWN is never automatically re-posted to Uber.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadQueue()}
          disabled={loading}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            className={`size-4 ${loading ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          {isZh ? '刷新' : 'Refresh'}
        </button>
      </header>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert
            className="mt-0.5 size-5 shrink-0 text-amber-700"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-amber-950">
              {isZh
                ? '根据 FAILED / UNKNOWN 选择恢复方式'
                : 'Choose recovery based on FAILED / UNKNOWN'}
            </h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-amber-950/80">
              <li>
                {isZh
                  ? 'FAILED：SanQ 已确认本次没有成功创建配送。先看每次自动尝试的具体错误，修正原因后可直接用 SanQ“重新派单”；新一轮仍包含最多 3 次自动重试。'
                  : 'FAILED: SanQ can confirm no delivery was successfully created. Review each automatic-attempt error, fix the cause, then retry from SanQ; the new cycle again allows up to 3 automatic retries.'}
              </li>
              <li>
                {isZh
                  ? 'UNKNOWN：禁止直接重试。打开 Uber Direct Dashboard → Deliveries，选择正确日期范围，用 SanQ 订单号（例如 WEB-1002）作为 manifest ID / order number 搜索。'
                  : 'UNKNOWN: do not retry directly. Open Uber Direct Dashboard → Deliveries, choose the correct date range, and search by the SanQ order number (for example WEB-1002) as manifest ID / order number.'}
              </li>
              <li>
                {isZh
                  ? 'Dashboard 找到配送：从详情 tracking URL 复制 orderUuid= 后的 Uber internal order ID，回 SanQ 绑定。'
                  : 'If Dashboard finds the delivery: copy the Uber internal order ID after orderUuid= in the tracking URL and bind it back in SanQ.'}
              </li>
              <li>
                {isZh
                  ? '如果你决定在 Dashboard 手工创建配送，也必须在创建完成后回 SanQ 填写该 orderUuid 完成绑定；不要让 Uber 配送与 SanQ 订单失联。'
                  : 'If you choose to create the delivery manually in Dashboard, return to SanQ afterwards and bind its orderUuid so the Uber delivery remains linked to the SanQ order.'}
              </li>
            </ol>
            <a
              href={UBER_DIRECT_DASHBOARD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-900 px-4 py-2 text-sm font-semibold text-white outline-none hover:bg-amber-800 focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              {isZh ? '打开 Uber Direct Dashboard' : 'Open Uber Direct Dashboard'}
            </a>
          </div>
        </div>
      </section>

      {loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {loadError}
        </div>
      ) : null}
      {actionError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {actionError}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {success}
        </div>
      ) : null}

      {loading ? (
        <div className="flex min-h-48 items-center justify-center rounded-2xl border border-slate-200 bg-white">
          <Loader2
            className="size-7 animate-spin text-slate-500"
            aria-label={isZh ? '加载中' : 'Loading'}
          />
        </div>
      ) : orderedItems.length === 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <Truck className="mx-auto size-8 text-emerald-700" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold text-emerald-950">
            {isZh
              ? '当前没有待处理配送异常'
              : 'No delivery reconciliation is pending'}
          </h2>
          <p className="mt-1 text-sm text-emerald-800/80">
            {isZh
              ? 'FAILED / UNKNOWN 队列为空。'
              : 'The FAILED / UNKNOWN queue is empty.'}
          </p>
        </div>
      ) : (
        <section
          className="space-y-4"
          aria-label={isZh ? '待处理配送异常' : 'Pending delivery reconciliation'}
        >
          {orderedItems.map((item) => (
            <DeliveryDispatchReconciliationCard
              key={itemKey(item)}
              item={item}
              isZh={isZh}
              isFocused={item.orderStableId === focusedOrderStableId}
              busy={actionTarget === itemKey(item)}
              onError={setActionError}
              onReconcile={reconcile}
            />
          ))}
        </section>
      )}
    </main>
  );
}
