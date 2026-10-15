"use client";

import { useCallback, useState } from "react";

import {
  fetchPosCardPaymentBenefitsReview,
  fetchPosCardPaymentReviewAttempt,
  recheckPosCardPaymentReviewAttempt,
  type PosCardPaymentReviewDetail,
  type PosCardPaymentReviewItem,
} from "@/lib/api/pos";

type Props = { locale: "zh" | "en" };

export function PosCardPaymentBenefitsReview({ locale }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<PosCardPaymentReviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [activeAttempt, setActiveAttempt] = useState<string | null>(null);
  const [detail, setDetail] = useState<PosCardPaymentReviewDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const zh = locale === "zh";

  const reload = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetchPosCardPaymentBenefitsReview();
      setItems(response.items);
    } catch {
      // Read failure cannot imply all prior financial attempts are resolved.
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const inspect = useCallback(
    async (attemptId: string, recheck: boolean) => {
      setActiveAttempt(attemptId);
      setChecking(true);
      setDetailError(null);
      setDetail(null);
      try {
        if (recheck) {
          // Reconcile the saved attempt; never start a new provider Sale.
          await recheckPosCardPaymentReviewAttempt(attemptId);
        }
        const current = await fetchPosCardPaymentReviewAttempt(attemptId);
        setDetail(current);
        if (recheck) await reload();
      } catch {
        setDetailError(
          zh
            ? "无法核查原付款。结果仍未确认，禁止重新刷卡。"
            : "Could not review the original payment. The result remains uncertain; do not recharge.",
        );
      } finally {
        setChecking(false);
      }
    },
    [reload, zh],
  );

  return (
    <section className="mx-auto w-full max-w-5xl px-4 pt-4">
      <div className="rounded-2xl border border-amber-400/30 bg-slate-800/80 p-3">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => {
            if (!expanded) void reload();
            setExpanded(!expanded);
          }}
          className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-sm font-semibold text-amber-100"
        >
          <span>
            {zh
              ? "Clover 长时间支付／权益释放待核查"
              : "Clover long-wait / benefit release review"}
          </span>
          <span aria-hidden="true">{expanded ? "−" : "+"}</span>
        </button>
        {expanded && (
          <div className="mt-2 space-y-3">
            <p className="text-xs text-slate-300">
              {zh
                ? "查看详情为只读；主动重新核对可更新已确认的资金结果，但不会发起 Sale。超时与 NOT_FOUND 不代表已取消，禁止据此解除权益占用。"
                : "Details are read-only. Explicit recheck may save confirmed payment truth but never issues a Sale. Timeout and NOT_FOUND do not prove cancellation or allow benefit release."}
            </p>
            <button
              type="button"
              onClick={() => void reload()}
              disabled={loading || checking}
              className="min-h-10 rounded-lg border border-slate-500 px-4 py-2 text-xs font-semibold text-slate-100 disabled:opacity-50"
            >
              {loading
                ? zh
                  ? "查询中…"
                  : "Loading…"
                : zh
                  ? "刷新待核查列表"
                  : "Refresh review queue"}
            </button>
            {error ? (
              <p role="alert" className="text-sm text-rose-200">
                {zh
                  ? "无法读取状态，请稍后重试；不能据此认定无待核查交易。"
                  : "Status unavailable. Retry later; do not assume the queue is empty."}
              </p>
            ) : !loading && items.length === 0 ? (
              <p className="text-xs text-slate-300">
                {zh
                  ? "当前未发现符合筛选条件的记录。"
                  : "No matching checkout records found."}
              </p>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto">
                {items.map((item) => (
                  <li
                    key={item.attemptId}
                    className="rounded-xl border border-slate-600 bg-slate-900/80 p-3 text-xs text-slate-200"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-amber-200">
                        {item.reviewReason === "RELEASE_PENDING"
                          ? zh
                            ? "确认失败／取消 · 权益释放待完成"
                            : "Final failure/cancel · benefit release pending"
                          : zh
                            ? "超过原准备时限 · 付款需核查"
                            : "Past preparation deadline · payment review"}
                      </span>
                      <span className="font-mono">{item.checkoutStatus}</span>
                    </div>
                    <p className="mt-2 break-all text-slate-400">
                      {zh ? "支付尝试" : "Attempt"}: {item.attemptId}
                    </p>
                    <p className="mt-1">
                      {zh ? "快照分配" : "Snapshot allocation"}:{" "}
                      {zh ? "积分" : "Points"} {item.pointsCents ?? "?"}¢ /{" "}
                      {zh ? "余额" : "Balance"} {item.balanceCents ?? "?"}¢ /{" "}
                      {zh ? "优惠" : "Coupon"} {item.couponDiscountCents ?? "?"}¢
                    </p>
                    <p className="mt-1 text-slate-400">
                      {zh ? "原准备截止" : "Original preparation deadline"}:{" "}
                      {item.preparedExpiresAt}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={checking || loading}
                        onClick={() => void inspect(item.attemptId, false)}
                        className="rounded-lg border border-slate-500 px-3 py-2 text-slate-100 disabled:opacity-50"
                      >
                        {zh ? "查看付款详情" : "View payment details"}
                      </button>
                      <button
                        type="button"
                        disabled={checking || loading}
                        onClick={() => void inspect(item.attemptId, true)}
                        className="rounded-lg border border-amber-400/60 px-3 py-2 text-amber-100 disabled:opacity-50"
                      >
                        {zh ? "向 Clover 重新核对" : "Recheck with Clover"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {activeAttempt && (
              <div
                className="space-y-2 rounded-xl border border-slate-500 bg-slate-900/80 p-3 text-xs text-slate-200"
                role="status"
              >
                <p className="break-all font-semibold text-slate-100">
                  {zh ? "原付款核查" : "Original payment review"}: {activeAttempt}
                </p>
                {checking && <p>{zh ? "正在核查…" : "Reviewing…"}</p>}
                {detailError && (
                  <p className="text-rose-200" role="alert">
                    {detailError}
                  </p>
                )}
                {detail && (
                  <>
                    <p>
                      {zh ? "结算状态" : "Checkout status"}: {detail.status}
                    </p>
                    <p>
                      {zh ? "支付状态" : "Payment status"}:{" "}
                      {detail.paymentStatus ?? "—"}
                    </p>
                    <p>
                      {zh ? "原始结果" : "Original result"}:{" "}
                      {detail.resultCode ?? "—"}
                    </p>
                    <p className="break-all">
                      External ID: {detail.externalPaymentId ?? "—"}
                    </p>
                    <p className="break-all">
                      Provider Payment ID: {detail.providerPaymentId ?? "—"}
                    </p>
                    <p>
                      {zh ? "终端操作状态" : "Terminal fence state"}:{" "}
                      {detail.terminalOperationState ?? "—"}
                    </p>
                    <p className="break-all">
                      Terminal ID: {detail.terminalId ?? "—"}
                    </p>
                    <p>
                      {zh ? "失败代码" : "Failure code"}:{" "}
                      {detail.failureCode ?? "—"}
                    </p>
                    {detail.failureMessage && <p>{detail.failureMessage}</p>}
                    <p>
                      {zh ? "权益已完成释放" : "Benefits release complete"}:{" "}
                      {detail.benefitsReleaseComplete
                        ? zh
                          ? "是"
                          : "Yes"
                        : zh
                          ? "否"
                          : "No"}
                    </p>
                    <p className="text-amber-200">
                      {zh
                        ? "没有最终支付结论时，不得发起另一笔银行卡付款。"
                        : "Do not initiate another card Sale while payment truth is unknown."}
                    </p>
                  </>
                )}
              </div>
            )}
            <p className="text-xs text-slate-400">
              {zh
                ? "按当前门店筛选，最多 25 条；金额为下单时的分配快照，不是权益账本实时状态。"
                : "Store-scoped, max 25 rows; amounts are allocation snapshots, not live benefit balances."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
