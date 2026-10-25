"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { apiFetch } from "@/lib/api/client";
import type { PaymentExceptionCase } from "@/lib/contracts/payment-exceptions";

export default function PaymentExceptionAdminPage() {
  const zh = usePathname().split("/")[1] === "zh";
  const [items, setItems] = useState<PaymentExceptionCase[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await apiFetch<PaymentExceptionCase[]>(
        "/admin/payments/exceptions",
      );
      setItems(data);
      setError(null);
    } catch {
      setError(zh ? "无法读取异常案件，请检查权限及 API 状态。" : "Unable to load payment exceptions. Check API permissions.");
    } finally {
      setLoading(false);
    }
  }, [zh]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const decide = async (
    caseStableId: string,
    decision: "APPROVED" | "REJECTED",
  ) => {
    if (note.trim().length < 12) return;
    setWorking(true);
    setError(null);
    try {
      await apiFetch(
        `/admin/payments/exceptions/${encodeURIComponent(caseStableId)}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, note: note.trim() }),
        },
      );
    } catch {
      setError(
        zh ? "审批或安全恢复未完成。审批决定可能已保存；请先刷新案件，不要重复提交。" : "Approval or recovery incomplete. Refresh before resubmitting; a decision may already be saved.",
      );
    } finally {
      await reload();
      setWorking(false);
      setSelected(null);
      setNote("");
    }
  };

  const retry = async (caseStableId: string) => {
    setWorking(true);
    setError(null);
    try {
      await apiFetch(
        `/admin/payments/exceptions/${encodeURIComponent(caseStableId)}/retry`,
        { method: "POST" },
      );
    } catch {
      setError(zh ? "恢复检查点未完成；请核对原付款及设备，不要发起新的刷卡。" : "Recovery checkpoints incomplete. Review payment and device before any new sale.");
    } finally {
      await reload();
      setWorking(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">{zh ? "支付异常处理审批" : "Payment exception approvals"}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {zh ? "STAFF 提交，ADMIN 审批。只可执行已有最终失败或取消证据的恢复；未决资金仅可调查。" : "STAFF submit requests; ADMIN approve. Only final provider-confirmed failures can be recovered. Uncertain funds remain under investigation."}
        </p>
      </header>
      <button
        type="button"
        onClick={() => void reload()}
        disabled={working}
        className="min-h-11 rounded-lg border border-slate-400 px-4 text-sm font-medium text-slate-900 disabled:opacity-50"
      >
        {zh ? "刷新案件" : "Refresh cases"}
      </button>
      {loading && <p>{zh ? "读取中…" : "Loading…"}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!loading && items.length === 0 && (
        <p className="text-sm text-slate-600">{zh ? "目前没有可见的付款异常案件。" : "No payment exception cases found."}</p>
      )}
      <div className="space-y-3">
        {items.map((item) => (
          <article
            key={item.caseStableId}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-900">
                {new Intl.NumberFormat("en-CA", {
                  style: "currency",
                  currency: item.currency,
                }).format(item.amountCents / 100)}
              </h2>
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                {item.status}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              {zh ? "门店" : "Store"}：{item.storeStableId} · {item.action} · {item.mode}
            </p>
            <p className="mt-1 break-all text-xs text-slate-600">
              {zh ? "原付款" : "Original Attempt"}：{item.attemptId}
            </p>
            <p className="mt-1 break-all text-xs text-slate-500">
              External ID：{item.externalPaymentId}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
              {zh ? "申请说明" : "Request note"}：{item.operatorNote}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {zh ? "申请人" : "Applicant"}：{item.requestedByStableId} · {new Date(item.createdAt).toLocaleString()}
            </p>
            {item.status === "REQUESTED" && (
              <div className="mt-4 space-y-2">
                {selected === item.caseStableId && (
                  <textarea
                    aria-label="审批意见"
                    placeholder={zh ? "审批意见（至少 12 个字符）" : "Decision note (12+ characters)" }
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={500}
                    className="min-h-20 w-full rounded-lg border border-slate-300 p-3 text-sm"
                  />
                )}
                {selected !== item.caseStableId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(item.caseStableId);
                      setNote("");
                    }}
                    className="min-h-11 rounded-lg border border-slate-400 px-4 text-sm"
                  >
                    {zh ? "审阅并决定" : "Review and decide"}
                  </button>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={working || note.trim().length < 12}
                      onClick={() => void decide(item.caseStableId, "APPROVED")}
                      className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {zh ? "批准安全处理" : "Approve guarded recovery"}
                    </button>
                    <button
                      type="button"
                      disabled={working || note.trim().length < 12}
                      onClick={() => void decide(item.caseStableId, "REJECTED")}
                      className="min-h-11 rounded-lg bg-slate-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {zh ? "拒绝申请" : "Reject request"}
                    </button>
                  </div>
                )}
              </div>
            )}
            {item.status === "NEEDS_REVIEW" &&
              item.mode === "PRODUCTION" &&
              item.action === "RELEASE_CONFIRMED_FAILURE" && (
                <button
                  type="button"
                  disabled={working}
                  onClick={() => void retry(item.caseStableId)}
                  className="mt-3 min-h-11 rounded-lg border border-amber-500 px-4 text-sm text-amber-800 disabled:opacity-50"
                >
                  {zh ? "重新检查原恢复检查点" : "Retry original checkpoints"}
                </button>
              )}
            {item.action === "INVESTIGATE_ONLY" && (
              <p className="mt-3 text-sm text-amber-700">
                {zh ? "仅能进行调查核对；ADMIN 批准不等于授权强制修改支付结果。" : "Investigation only. ADMIN approval cannot force payment finality."}
              </p>
            )}
          </article>
        ))}
      </div>
    </main>
  );
}
