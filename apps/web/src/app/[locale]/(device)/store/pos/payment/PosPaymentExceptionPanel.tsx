"use client";

import { useCallback, useEffect, useState } from "react";

import {
  createPosPaymentExceptionCase,
  executePosPaymentExceptionCase,
  fetchPosPaymentExceptionCase,
  type PaymentExceptionCase,
  type PosCardPaymentReviewDetail,
} from "@/lib/api/pos";

export function PosPaymentExceptionPanel({
  locale,
  detail,
  onUpdated,
}: {
  locale: "zh" | "en";
  detail: PosCardPaymentReviewDetail;
  onUpdated: () => Promise<void>;
}) {
  const zh = locale === "zh";
  const [entry, setEntry] = useState<PaymentExceptionCase | null>(null);
  const [note, setNote] = useState("");
  const [orderId, setOrderId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const current = await fetchPosPaymentExceptionCase(detail.attemptId);
    setEntry(current);
  }, [detail.attemptId]);

  useEffect(() => {
    setEntry(null);
    setError(null);
    void refresh().catch(() =>
      setError(
        zh
          ? "暂时无法读取异常案件；请勿重复提交或重新刷卡。"
          : "Unable to load the exception case. Do not recharge.",
      ),
    );
  }, [refresh, zh]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      setEntry(
        await createPosPaymentExceptionCase(detail.attemptId, {
          operatorNote: note.trim(),
          ...(orderId.trim() ? { cloverOrderId: orderId.trim() } : {}),
        }),
      );
    } catch {
      setError(
        zh
          ? "申请未完成，请刷新案件状态并核对证据。"
          : "Request could not be completed. Refresh and review evidence.",
      );
    } finally {
      setBusy(false);
    }
  };

  const execute = async () => {
    if (!entry) return;
    setBusy(true);
    setError(null);
    try {
      setEntry(await executePosPaymentExceptionCase(entry.caseStableId));
      await onUpdated();
    } catch {
      await refresh().catch(() => undefined);
      setError(
        zh
          ? "系统未完成恢复，保持设备防护锁；请查看案件状态，禁止重复刷卡。"
          : "Recovery is incomplete. The terminal remains fenced; do not recharge.",
      );
    } finally {
      setBusy(false);
    }
  };

  const terminalFinal = ["FAILED", "DECLINED", "CANCELLED"].includes(
    detail.paymentStatus ?? "",
  );
  const eligible = detail.paymentStatus === "RECONCILING" || terminalFinal;
  if (!eligible && !entry) return null;

  return (
    <section className="mt-4 space-y-3 rounded-xl border border-cyan-400/50 bg-slate-900/70 p-3 text-sm text-slate-100">
      <h4 className="font-semibold text-cyan-200">
        {zh ? "付款异常人工处理" : "Payment exception management"}
      </h4>
      <p className="text-xs text-slate-300">
        {zh
          ? "申请、审批和执行均会留下独立审计。任何人工确认都不能伪造 Clover 扣款结果；未通过检查时不会解除权益或设备防护锁。"
          : "Requests, approvals and executions are audited. An operator cannot invent Clover financial truth or bypass the device fence."}
      </p>
      {entry ? (
        <div className="space-y-2">
          <p>
            {zh ? "案件状态" : "Case status"}: <strong>{entry.status}</strong>
          </p>
          <p className="break-all text-xs text-slate-300">
            {zh ? "处理动作" : "Action"}: {entry.action}
          </p>
          <p className="text-xs text-slate-300">
            {entry.mode === "SANDBOX"
              ? zh
                ? "Sandbox：由当前 POS 操作员执行，不需要 ADMIN 审批。"
                : "Sandbox: POS operator may execute; no admin approval."
              : zh
                ? "Production：申请已提交，必须由 ADMIN 审批并触发安全核验。"
                : "Production: an ADMIN must approve and trigger guarded execution."}
          </p>
          {entry.mode === "SANDBOX" &&
            ["APPROVED", "NEEDS_REVIEW"].includes(entry.status) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void execute()}
                className="min-h-11 rounded-lg border border-cyan-300 px-4 font-semibold text-cyan-100 disabled:opacity-50"
              >
                {busy
                  ? zh ? "正在验证…" : "Verifying…"
                  : zh ? "执行已确认的受控恢复" : "Execute guarded recovery"}
              </button>
            )}
          {entry.status === "COMPLETED" && (
            <p className="text-emerald-200">
              {zh ? "恢复检查点已完成。" : "Recovery checkpoints completed."}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block">
            <span className="text-xs">{zh ? "Clover 原订单编号（Sandbox 必填）" : "Original Clover order (required in Sandbox)"}</span>
            <input
              value={orderId}
              onChange={(event) => setOrderId(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-500 bg-slate-950 px-3"
              maxLength={50}
              aria-label="Original Clover order ID"
            />
          </label>
          <label className="block">
            <span className="text-xs">{zh ? "人工核对说明（至少 12 个字符）" : "Evidence note (12+ characters)"}</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1 min-h-20 w-full rounded-lg border border-slate-500 bg-slate-950 p-3"
              maxLength={500}
              aria-label="Exception evidence note"
            />
          </label>
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              {zh
                ? "我已核实原始订单和付款，理解未决资金不得按已失败处理。"
                : "I reviewed the original order and payment; uncertain funds cannot be declared failed."}
            </span>
          </label>
          <button
            type="button"
            disabled={busy || !confirmed || note.trim().length < 12}
            onClick={() => void submit()}
            className="min-h-11 rounded-lg border border-cyan-400 px-4 font-semibold text-cyan-100 disabled:opacity-50"
          >
            {busy ? zh ? "提交中…" : "Submitting…" : zh ? "建立异常处理案件" : "Create exception case"}
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-rose-300">{error}</p>}
    </section>
  );
}
