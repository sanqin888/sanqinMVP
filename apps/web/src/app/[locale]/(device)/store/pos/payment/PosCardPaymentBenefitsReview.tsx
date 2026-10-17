"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchPosCardPaymentBenefitsReview,
  fetchPosCardPaymentReviewAttempt,
  manuallyCloseSandboxUnpaid,
  recheckPosCardPaymentReviewAttempt,
  type PosCardPaymentActiveReviewItem,
  type PosCardPaymentReviewDetail,
  type PosCardPaymentReviewItem,
} from "@/lib/api/pos";
import { partitionPosCardPaymentReviewQueues } from "./pos-card-payment-review-queues";

type Props = {
  locale: "zh" | "en";
  /** Current device's original persisted Attempt, even before the queue TTL. */
  currentPendingAttemptId?: string | null;
  currentPendingStatus?: string | null;
  autoInspectAttemptId?: string | null;
};

/** Warn only while the original financial outcome is not final. */
export function shouldWarnUnresolvedCardReview(
  detail: Pick<PosCardPaymentReviewDetail, "status" | "paymentStatus">,
): boolean {
  const status = detail.paymentStatus ?? detail.status;
  return (
    status === "CREATED" ||
    status === "PROCESSING" ||
    status === "UNKNOWN" ||
    status === "RECONCILING"
  );
}

export function PosCardPaymentBenefitsReview({
  locale,
  currentPendingAttemptId,
  currentPendingStatus,
  autoInspectAttemptId,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<PosCardPaymentReviewItem[]>([]);
  const [activeItems, setActiveItems] = useState<PosCardPaymentActiveReviewItem[]>([]);
  const refreshingRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [activeAttempt, setActiveAttempt] = useState<string | null>(null);
  const [detail, setDetail] = useState<PosCardPaymentReviewDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [lookupAttemptId, setLookupAttemptId] = useState("");
  const [cloverOrderId, setCloverOrderId] = useState("");
  const [operatorNote, setOperatorNote] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [understood, setUnderstood] = useState(false);
  const zh = locale === "zh";
  const reviewQueues = partitionPosCardPaymentReviewQueues(
    activeItems,
    items,
    currentPendingAttemptId,
  );
  const activeReviewItems = reviewQueues.activeItems;
  const historicalItems = reviewQueues.historicalItems;

  const reload = useCallback(async (showSpinner = true) => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    if (showSpinner) setLoading(true);
    try {
      const response = await fetchPosCardPaymentBenefitsReview();
      setItems(response.items);
      setActiveItems(response.activeItems ?? []);
      setError(false);
    } catch {
      // A read failure never proves that an outstanding charge is resolved.
      setError(true);
    } finally {
      refreshingRef.current = false;
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Store-scoped passive refresh only; no Clover query, Sale, or mutation.
    // Keep a compact count current even while this panel is collapsed.
    void reload();
    const refresh = () => {
      if (document.visibilityState === "visible") void reload(false);
    };
    const interval = window.setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [reload]);

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

  useEffect(() => {
    if (!autoInspectAttemptId) return;
    // This is an ordinary read of the same saved Attempt, not a Clover recheck.
    setExpanded(true);
    setLookupAttemptId(autoInspectAttemptId);
    void inspect(autoInspectAttemptId, false);
  }, [autoInspectAttemptId, inspect]);

  const closeUnpaid = useCallback(async () => {
    if (
      !detail ||
      confirmation !== "CONFIRM UNPAID" ||
      !understood ||
      cloverOrderId.trim().length < 4 ||
      operatorNote.trim().length < 12
    ) return;
    setChecking(true);
    setDetailError(null);
    try {
      await manuallyCloseSandboxUnpaid(detail.attemptId, {
        confirmation: "CONFIRM UNPAID",
        cloverOrderId: cloverOrderId.trim(),
        operatorNote: operatorNote.trim(),
      });
      const latest = await fetchPosCardPaymentReviewAttempt(detail.attemptId);
      setDetail(latest);
      await reload();
      setConfirmation("");
      setUnderstood(false);
    } catch {
      setDetailError(
        zh
          ? "受控人工恢复尚未完成。可能存在付款冲突或设备/权益检查未通过，严禁再次刷卡。"
          : "Manual recovery did not complete. Payment, device or benefit checks may have failed. Do not recharge.",
      );
    } finally {
      setChecking(false);
    }
  }, [
    detail,
    confirmation,
    understood,
    cloverOrderId,
    operatorNote,
    reload,
    zh,
  ]);

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
              ? "Clover 付款核查（当前未决／历史待处理）"
              : "Clover payment review (unresolved / historic)"}
            {activeItems.length > 0 ? ` · ${activeItems.length}` : ""}
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
            {currentPendingAttemptId && (
              <div className="space-y-2 rounded-xl border border-amber-400/70 bg-amber-500/10 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-amber-100">
                    {zh ? "本机当前银行卡付款 · 优先核查" : "Current device card payment · priority"}
                  </span>
                  <span className="font-mono text-xs text-amber-200">
                    {currentPendingStatus ?? (zh ? "待确认" : "Pending")}
                  </span>
                </div>
                <p className="text-xs text-slate-200">
                  {zh
                    ? "无需输入付款编号。即使尚未超过准备时限，也可以直接查看这笔原付款；查看不会重新扣款或释放权益。"
                    : "No ID entry needed. Inspect the original payment before its deadline; this read never charges or releases benefits."}
                </p>
                <button
                  type="button"
                  disabled={checking}
                  onClick={() => void inspect(currentPendingAttemptId, false)}
                  className="min-h-11 rounded-lg border border-amber-300 px-4 font-semibold text-amber-100 disabled:opacity-50"
                >
                  {zh ? "查看本机原付款详情" : "View current payment details"}
                </button>
              </div>
            )}
            <div className="space-y-2 rounded-xl border border-slate-600 p-3">
              <h3 className="text-sm font-semibold text-slate-100">
                {zh ? "本门店当前未决付款（最近 10 笔）" : "Unresolved payments in this Store (latest 10)"}
              </h3>
              <p className="text-xs text-slate-300">
                {zh
                  ? "来自门店数据库，不依赖本机缓存；约每 15 秒只读刷新。显示状态不是最终扣款证明，列表未包含的旧记录仍可能需要核查。"
                  : "Store-backed, not browser history. Read-only refresh every ~15 seconds. A status is not payment finality; older unresolved records may be outside this limit."}
              </p>
              {error && (
                <p role="alert" className="text-xs text-rose-200">
                  {zh
                    ? "本次门店查询失败，当前显示的记录可能已过期，不能据此判断付款已结清。"
                    : "Store query failed. Displayed records may be stale; do not infer payment finality."}
                </p>
              )}
              {!error && activeReviewItems.length === 0 ? (
                <p className="text-xs text-slate-300">
                  {zh
                    ? currentPendingAttemptId
                      ? "当前列表中没有其他未决记录，本机原付款可在上方核查。"
                      : "当前最多 10 条结果中没有未决付款；不代表历史付款全部结清。"
                    : currentPendingAttemptId
                      ? "No other unresolved rows listed; inspect this device's original above."
                      : "No unresolved items in the latest 10 slots. Older attempts may still require review."}
                </p>
              ) : activeReviewItems.length > 0 ? (
                <ul className="max-h-72 space-y-2 overflow-y-auto">
                  {activeReviewItems.map((item) => (
                    <li
                      key={item.attemptId}
                      className="rounded-xl border border-amber-400/40 bg-slate-900/80 p-3 text-xs text-slate-200"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-amber-200">
                          {new Date(item.createdAt).toLocaleString(
                            zh ? "zh-CN" : "en-CA",
                          )}
                        </span>
                        <span className="font-mono">{item.checkoutStatus}</span>
                      </div>
                      <p className="mt-2">
                        {zh ? "待付银行卡金额" : "Card remainder"}:{" "}
                        {new Intl.NumberFormat(zh ? "zh-CN" : "en-CA", {
                          style: "currency",
                          currency: item.currency,
                        }).format(item.externalAmountCents / 100)}
                      </p>
                      <p className="mt-1 text-slate-400">
                        {zh ? "最近更新" : "Last updated"}:{" "}
                        {new Date(item.updatedAt).toLocaleString(
                          zh ? "zh-CN" : "en-CA",
                        )}
                      </p>
                      <button
                        type="button"
                        disabled={checking}
                        onClick={() => void inspect(item.attemptId, false)}
                        className="mt-3 min-h-11 rounded-lg border border-amber-300 px-4 font-semibold text-amber-100 disabled:opacity-50"
                      >
                        {zh ? "查看原付款详情" : "View original payment"}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="text-sm font-semibold text-slate-100">
              {zh ? "历史超时／权益待释放（最多 25 笔）" : "Historic long-wait / release pending (up to 25)"}
            </div>
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
                  ? "刷新全部核查列表"
                  : "Refresh both review queues"}
            </button>
            <details className="rounded-lg border border-slate-600/60 p-2 text-xs text-slate-300">
              <summary className="cursor-pointer py-1 font-medium">
                {zh
                  ? "高级核查：按付款 ID 查找（技术支持）"
                  : "Advanced: lookup by payment ID (support)"}
              </summary>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  value={lookupAttemptId}
                  onChange={(event) => setLookupAttemptId(event.target.value)}
                  placeholder={zh ? "输入原付款 Attempt ID" : "Original Attempt ID"}
                  aria-label={zh ? "原付款 Attempt ID" : "Original Attempt ID"}
                  className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-500 bg-slate-900 px-3 text-xs"
                />
                <button
                  type="button"
                  disabled={checking || !lookupAttemptId.trim()}
                  onClick={() => void inspect(lookupAttemptId.trim(), false)}
                  className="min-h-10 rounded-lg border border-slate-500 px-3 text-xs text-slate-100 disabled:opacity-50"
                >
                  {zh ? "按编号查看" : "Find attempt"}
                </button>
              </div>
            </details>
            {error ? (
              <p role="alert" className="text-sm text-rose-200">
                {zh
                  ? "无法读取状态，请稍后重试；不能据此认定无待核查交易。"
                  : "Status unavailable. Retry later; do not assume the queue is empty."}
              </p>
            ) : !loading && historicalItems.length === 0 ? (
              <p className="text-xs text-slate-300">
                {zh
                  ? currentPendingAttemptId
                    ? "历史待核查列表没有其他记录，本机当前付款可以直接在上方查看。"
                    : "当前门店没有符合长时间等待或权益释放待完成条件的记录。"
                  : currentPendingAttemptId
                    ? "No other historical review records. Inspect the current payment above."
                    : "No store payment currently matches the long-wait or release-pending review filters."}
              </p>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto">
                {historicalItems.map((item) => (
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
                    {shouldWarnUnresolvedCardReview(detail) && (
                      <p className="text-amber-200">
                        {zh
                          ? "没有最终支付结论时，不得发起另一笔银行卡付款。"
                          : "Do not initiate another card Sale while payment truth is unknown."}
                      </p>
                    )}
                    {detail.sandboxLateCanonicalPayment && (
                      <p role="alert" className="rounded-lg border border-rose-400 bg-rose-950/80 p-3 font-semibold text-rose-100">
                        {zh
                          ? "严重冲突：Clover 后来报告了真实付款！停止后续刷卡，立即核对退款和权益。"
                          : "Critical: Clover later reported a real payment. Stop new card Sales and reconcile/refund manually."}
                      </p>
                    )}
                    {detail.sandboxOperatorUnpaidAccepted && (
                      <p className="text-amber-100">
                        {detail.sandboxRecoveryTerminalFinalized
                          ? zh
                            ? "人工未扣款结案已记录；设备检查点已完成。这不是 Clover 自动取消。"
                            : "Operator closure recorded and device finalized. Not a Clover cancellation."
                          : zh
                            ? "人工未扣款结案已记录；仍有权益或设备检查点待完成。"
                            : "Operator closure recorded; benefit or device checkpoint remains pending."}
                      </p>
                    )}
                    {detail.sandboxManualRecoveryEnabled &&
                      ((
                        detail.paymentStatus === "RECONCILING" &&
                        detail.resultCode === "CLOVER_TERMINAL_SALE_HTTP_504" &&
                        detail.terminalOperationState === "SALE_IN_FLIGHT"
                      ) || (
                        detail.sandboxOperatorUnpaidAccepted &&
                        !detail.sandboxRecoveryTerminalFinalized
                      )) && (
                      <div className="space-y-3 rounded-lg border border-amber-500/50 p-3">
                        <p className="font-semibold text-amber-100">
                          {zh ? "Sandbox 人工确认未扣款（高风险）" : "Sandbox operator-attested unpaid closure"}
                        </p>
                        <p className="text-amber-200">
                          {zh
                            ? "仅适用于隔离 Sandbox。系统将再次查 Clover，并要求 Compact 空闲；操作员接受未发现付款不等于绝对没有扣款的风险。此操作可能释放积分、余额及优惠券。"
                            : "Isolated Sandbox only. The server rechecks Clover and the idle device. NOT_FOUND is not absolute proof, and accepting the risk may release benefits."}
                        </p>
                        <input
                          value={cloverOrderId}
                          onChange={(event) => setCloverOrderId(event.target.value)}
                          placeholder={zh ? "Clover Open 订单 ID" : "Clover Open order ID"}
                          aria-label="Clover Order ID"
                          className="min-h-11 w-full rounded-lg border border-slate-500 bg-slate-900 px-3"
                        />
                        <textarea
                          value={operatorNote}
                          onChange={(event) => setOperatorNote(event.target.value)}
                          placeholder={zh ? "人工核对说明（至少 12 个字符）" : "Operator evidence and reason (min 12 characters)"}
                          aria-label={zh ? "人工核对说明" : "Operator evidence and reason"}
                          className="min-h-20 w-full rounded-lg border border-slate-500 bg-slate-900 p-3"
                        />
                        <label className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={understood}
                            onChange={(event) => setUnderstood(event.target.checked)}
                          />
                          <span>
                            {zh
                              ? "我已经在 Test Merchant 核对该原订单 No Payments，知晓可能存在延迟入账和后续财务冲突。"
                              : "I checked No Payments for the original order in Test Merchant and accept delayed-payment/conflict risk."}
                          </span>
                        </label>
                        <input
                          value={confirmation}
                          onChange={(event) => setConfirmation(event.target.value)}
                          placeholder="CONFIRM UNPAID"
                          aria-label="CONFIRM UNPAID"
                          className="min-h-11 w-full rounded-lg border border-amber-500/60 bg-slate-900 px-3"
                        />
                        <button
                          type="button"
                          disabled={
                            checking ||
                            !understood ||
                            confirmation !== "CONFIRM UNPAID" ||
                            cloverOrderId.trim().length < 4 ||
                            operatorNote.trim().length < 12
                          }
                          onClick={() => void closeUnpaid()}
                          className="min-h-11 w-full rounded-lg border border-amber-400 bg-amber-700/50 px-4 font-semibold text-amber-100 disabled:opacity-50"
                        >
                          {checking
                            ? zh ? "正在执行安全核查…" : "Checking safety…"
                            : zh ? "人工确认未扣款并恢复" : "Confirm unpaid and recover"}
                        </button>
                      </div>
                    )}
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
