'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';

export type DeliveryDispatchReconciliationState = 'FAILED' | 'UNKNOWN';

export type DeliveryDispatchReconciliationItem = {
  orderStableId: string;
  orderNumber: string;
  attempt: number;
  state: DeliveryDispatchReconciliationState;
  requiresAction: boolean;
  orderStatus: string;
  externalDeliveryId: string | null;
  reason: string | null;
  errorMessage: string | null;
  providerDeliveryId: string | null;
  failureHistory: Array<{
    attempt: number;
    reason: string;
    errorMessage: string;
    statusCode: number | null;
  }>;
  deliveryDestination: {
    name: string;
    phone: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    province: string | null;
    postalCode: string | null;
    country: string;
    instructions: string | null;
  } | null;
  eventAt: string;
};

export type DeliveryDispatchReconciliationAction =
  | 'BIND_EXISTING'
  | 'CONFIRM_NOT_CREATED_RETRY';

type Props = {
  item: DeliveryDispatchReconciliationItem;
  isZh: boolean;
  isFocused: boolean;
  busy: boolean;
  onError: (message: string) => void;
  onReconcile: (params: {
    item: DeliveryDispatchReconciliationItem;
    action: DeliveryDispatchReconciliationAction;
    providerDeliveryId?: string;
    note?: string;
  }) => Promise<void>;
};

export function DeliveryDispatchReconciliationCard({
  item,
  isZh,
  isFocused,
  busy,
  onError,
  onReconcile,
}: Props) {
  const isUnknown = item.state === 'UNKNOWN';
  const hasCurrentBinding = Boolean(item.externalDeliveryId);
  const hasBindConflict =
    item.reason === 'LOCAL_BIND_CONFLICT' &&
    hasCurrentBinding &&
    Boolean(item.providerDeliveryId) &&
    item.externalDeliveryId !== item.providerDeliveryId;
  const [providerDeliveryId, setProviderDeliveryId] = useState(
    (hasCurrentBinding ? item.externalDeliveryId : item.providerDeliveryId) ?? '',
  );
  const [retryConfirmed, setRetryConfirmed] = useState(false);
  const [note, setNote] = useState('');

  async function handleBind(): Promise<void> {
    const normalizedProviderDeliveryId = providerDeliveryId.trim();
    if (!normalizedProviderDeliveryId) {
      onError(
        isZh
          ? '请先填写 Uber internal order ID（tracking URL 中 orderUuid= 后的值）。'
          : 'Enter the Uber internal order ID (the value after orderUuid= in the tracking URL).',
      );
      return;
    }

    const confirmed = window.confirm(
      hasBindConflict
        ? isZh
          ? `确认你已在 Uber Direct Dashboard 核对两个 delivery，并已处理/取消多余配送；SanQ 将继续保留当前绑定 ${normalizedProviderDeliveryId}？`
          : `Confirm you reviewed both deliveries in Uber Direct Dashboard and resolved/cancelled the duplicate. SanQ will keep the current binding ${normalizedProviderDeliveryId}?`
        : isZh
          ? `确认已在 Uber Direct Dashboard 找到订单 ${item.orderNumber}，并将 SanQ 订单绑定到 Uber delivery ${normalizedProviderDeliveryId}？`
          : `Confirm that order ${item.orderNumber} exists in Uber Direct Dashboard and bind SanQ to Uber delivery ${normalizedProviderDeliveryId}?`,
    );
    if (!confirmed) return;

    await onReconcile({
      item,
      action: 'BIND_EXISTING',
      providerDeliveryId: normalizedProviderDeliveryId,
      note: note.trim() || undefined,
    });
  }

  async function handleRetry(): Promise<void> {
    if (isUnknown && !retryConfirmed) {
      onError(
        isZh
          ? 'UNKNOWN 必须先确认你已经在 Uber Direct Dashboard 按订单号查询，并确认没有对应配送。'
          : 'UNKNOWN requires Dashboard verification by order number before retry can be authorized.',
      );
      return;
    }

    const confirmed = window.confirm(
      isUnknown
        ? isZh
          ? `确认 Uber Direct 中没有订单 ${item.orderNumber} 的配送记录，并授权系统创建 attempt ${item.attempt + 1}？新 attempt 会重新获得 3 次自动重试额度。`
          : `Confirm Uber Direct has no delivery for ${item.orderNumber} and authorize attempt ${item.attempt + 1}? The new attempt gets a fresh allowance of 3 automatic retries.`
        : isZh
          ? `确认在排查上述失败原因后重新派单？系统将创建 attempt ${item.attempt + 1}，并在可安全重试的失败下最多再自动重试 3 次。`
          : `Retry after reviewing the failure details? The system will create attempt ${item.attempt + 1} and allow up to 3 further automatic retries when retry is safe.`,
    );
    if (!confirmed) return;

    await onReconcile({
      item,
      action: 'CONFIRM_NOT_CREATED_RETRY',
      note: note.trim() || undefined,
    });
  }

  return (
    <article
      className={[
        'rounded-2xl border bg-white p-5 shadow-sm',
        isUnknown ? 'border-red-200' : 'border-amber-200',
        isFocused ? 'ring-2 ring-[#87362E]/40 ring-offset-2' : '',
      ].join(' ')}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={
                isUnknown
                  ? 'rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800'
                  : 'rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800'
              }
            >
              {item.state}
            </span>
            <span className="text-xs font-medium text-slate-500">
              attempt {item.attempt}
            </span>
          </div>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            {item.orderNumber}
          </h2>
          <p className="mt-1 break-all text-xs text-slate-500">
            {item.orderStableId}
          </p>
        </div>
        <div className="text-sm text-slate-600 lg:text-right">
          <p>
            {isZh ? '订单状态' : 'Order status'}:{' '}
            <strong>{item.orderStatus}</strong>
          </p>
          {item.externalDeliveryId ? (
            <p className="break-all">
              {isZh ? 'SanQ 当前绑定' : 'Current SanQ binding'}:{' '}
              <strong>{item.externalDeliveryId}</strong>
            </p>
          ) : null}
          <p>
            {new Date(item.eventAt).toLocaleString(isZh ? 'zh-CN' : 'en-CA')}
          </p>
        </div>
      </div>

      <div
        className={
          isUnknown
            ? 'mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-900'
            : 'mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900'
        }
      >
        <div className="flex gap-2">
          <Search className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">
              {isUnknown
                ? isZh
                  ? 'Uber 是否已建单未知：禁止直接重试'
                  : 'Uber creation outcome is unknown: do not retry directly'
                : isZh
                  ? '派单已确定失败：先根据失败记录排查原因'
                  : 'Dispatch definitely failed: review the failure details first'}
            </p>
            <p className="mt-1">
              {isZh ? '原因' : 'Reason'}: {item.reason ?? '-'}
            </p>
            {item.errorMessage ? (
              <p className="mt-1 break-words">
                {isZh ? '错误' : 'Error'}: {item.errorMessage}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {item.deliveryDestination ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-950">
            {isZh ? '手工建单所需收货信息' : 'Delivery details for manual creation'}
          </h3>
          <div className="mt-2 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
            <p>
              <span className="font-medium text-slate-900">
                {isZh ? '收货人' : 'Recipient'}:
              </span>{' '}
              {item.deliveryDestination.name}
            </p>
            <p>
              <span className="font-medium text-slate-900">
                {isZh ? '电话' : 'Phone'}:
              </span>{' '}
              {item.deliveryDestination.phone ?? '-'}
            </p>
            <p className="md:col-span-2">
              <span className="font-medium text-slate-900">
                {isZh ? '地址' : 'Address'}:
              </span>{' '}
              {[
                item.deliveryDestination.addressLine1,
                item.deliveryDestination.addressLine2,
                item.deliveryDestination.city,
                item.deliveryDestination.province,
                item.deliveryDestination.postalCode,
                item.deliveryDestination.country,
              ]
                .filter(Boolean)
                .join(', ') || '-'}
            </p>
            {item.deliveryDestination.instructions ? (
              <p className="md:col-span-2">
                <span className="font-medium text-slate-900">
                  {isZh ? '配送备注' : 'Delivery notes'}:
                </span>{' '}
                {item.deliveryDestination.instructions}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {item.failureHistory.length > 0 ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-950">
            {isZh ? '自动尝试 / 失败记录' : 'Automatic attempts / failure history'}
          </h3>
          <div className="mt-2 space-y-2 text-sm text-slate-700">
            {item.failureHistory.map((failure) => (
              <div
                key={`${failure.attempt}:${failure.reason}`}
                className="rounded-lg bg-white px-3 py-2"
              >
                <p className="font-medium text-slate-900">
                  Attempt {failure.attempt} · {failure.reason}
                  {typeof failure.statusCode === 'number'
                    ? ` · HTTP ${failure.statusCode}`
                    : ''}
                </p>
                <p className="mt-1 break-words text-xs leading-5 text-slate-600">
                  {failure.errorMessage}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-950">
            {isZh ? 'A. Uber 已经创建成功' : 'A. Uber delivery exists'}
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {hasBindConflict
              ? isZh
                ? 'SanQ 当前绑定和本次 Uber 返回的是两个不同 ID。请先在 Uber Dashboard 核对两个配送，并取消/处理多余配送；SanQ 不允许在这里直接覆盖现有绑定。'
                : 'SanQ is already bound to a different Uber ID than the one returned by this attempt. Review both deliveries in Uber Dashboard and cancel/resolve the duplicate first; this screen will not overwrite the current binding.'
              : isZh
                ? '如果 Dashboard 已有配送，或你决定在 Dashboard 手工创建配送：进入 delivery detail，从 tracking URL 复制 orderUuid= 后的 internal order ID，然后回到这里绑定到 SanQ。'
                : 'If a delivery already exists in Dashboard, or you choose to create one manually there: open delivery detail, copy the internal order ID after orderUuid= in the tracking URL, then return here and bind it to SanQ.'}
          </p>
          {hasBindConflict ? (
            <div className="mt-3 space-y-1 rounded-lg bg-red-50 p-3 text-xs text-red-900">
              <p className="break-all">
                {isZh ? 'SanQ 当前绑定' : 'Current SanQ binding'}:{' '}
                <strong>{item.externalDeliveryId}</strong>
              </p>
              <p className="break-all">
                {isZh ? '本次 Uber 返回' : 'Returned by this attempt'}:{' '}
                <strong>{item.providerDeliveryId}</strong>
              </p>
            </div>
          ) : null}
          <label className="mt-3 block text-sm font-medium text-slate-700">
            Uber internal order ID / orderUuid
            <input
              value={providerDeliveryId}
              onChange={(event) => setProviderDeliveryId(event.target.value)}
              disabled={busy}
              className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:bg-slate-100"
              placeholder="orderUuid"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleBind()}
            className="mt-3 inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white outline-none hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy
              ? isZh
                ? '处理中…'
                : 'Working…'
              : hasBindConflict
                ? isZh
                  ? '确认保留当前绑定'
                  : 'Confirm current binding'
                : isZh
                  ? '绑定已存在配送'
                  : 'Bind existing delivery'}
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-950">
            {isUnknown
              ? isZh
                ? 'B. Dashboard 确认没有创建'
                : 'B. Dashboard confirms no delivery'
              : isZh
                ? 'B. 修正原因后由 SanQ 重新派单'
                : 'B. Retry from SanQ after fixing the cause'}
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {isUnknown
              ? isZh
                ? `UNKNOWN 必须确认 Dashboard 搜不到订单 ${item.orderNumber} 后，才能授权 attempt ${item.attempt + 1}。`
                : `For UNKNOWN, authorize attempt ${item.attempt + 1} only after Dashboard confirms no delivery for ${item.orderNumber}.`
              : isZh
                ? 'FAILED 表示系统能够确认本次没有成功创建 Uber 配送。排查并修正上面的原因后，可以直接由 SanQ 开启新一轮派单；新一轮最多自动重试 3 次。'
                : 'FAILED means SanQ can confirm the provider did not successfully create this delivery. After fixing the cause, start a new SanQ dispatch cycle with up to 3 automatic retries.'}
          </p>
          <label className="mt-3 flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isUnknown ? retryConfirmed : true}
              onChange={(event) => setRetryConfirmed(event.target.checked)}
              disabled={busy || hasCurrentBinding || !isUnknown}
              className="mt-1 size-4"
            />
            <span>
              {hasCurrentBinding
                ? hasBindConflict
                  ? isZh
                    ? '检测到两个不同 Uber ID 时禁止创建新 attempt；请先处理重复配送并保留当前绑定。'
                    : 'A new attempt is disabled while two different Uber IDs are present. Resolve the duplicate and keep the current binding first.'
                  : isZh
                    ? 'SanQ 已经存在 Uber 配送绑定，因此禁止创建新的 attempt；请核对该绑定后使用左侧操作完成 reconciliation。'
                    : 'SanQ already has an Uber delivery binding, so a new attempt is disabled. Verify that binding and finish reconciliation using the action on the left.'
                : isUnknown
                  ? isZh
                    ? `我已在 Uber Direct Dashboard 使用订单号 ${item.orderNumber} 查询，并确认没有对应配送。`
                    : `I searched Uber Direct Dashboard using order number ${item.orderNumber} and confirmed there is no matching delivery.`
                  : isZh
                    ? '该失败已被系统分类为可安全重试；请先根据失败记录排查原因。'
                    : 'This failure is classified as safe to retry; review and fix the failure details first.'}
            </span>
          </label>
          <button
            type="button"
            disabled={
              busy ||
              hasCurrentBinding ||
              (isUnknown && !retryConfirmed)
            }
            onClick={() => void handleRetry()}
            className="mt-3 inline-flex min-h-10 items-center justify-center rounded-xl bg-[#87362E] px-4 py-2 text-sm font-semibold text-white outline-none hover:bg-[#762f28] focus-visible:ring-2 focus-visible:ring-[#87362E]/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy
              ? isZh
                ? '处理中…'
                : 'Working…'
              : isZh
                ? isUnknown
                  ? '确认未创建并重新派单'
                  : '重新派单（自动重试 3 次）'
                : isUnknown
                  ? 'Confirm absent and authorize retry'
                  : 'Retry dispatch (+3 auto retries)'}
          </button>
        </div>
      </div>

      <label className="mt-4 block text-sm font-medium text-slate-700">
        {isZh ? '处理备注（可选）' : 'Operator note (optional)'}
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={busy}
          rows={2}
          maxLength={500}
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:bg-slate-100"
          placeholder={
            isZh
              ? '例如：已在 Uber Dashboard 的 Today / 当前日期范围核对。'
              : 'Example: checked Uber Dashboard Today / current date range.'
          }
        />
      </label>
    </article>
  );
}
