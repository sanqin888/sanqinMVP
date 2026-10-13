"use client";

import { useCallback, useState } from "react";

import {
  fetchPosCardPaymentBenefitsReview,
  type PosCardPaymentReviewItem,
} from "@/lib/api/pos";

type Props = { locale: "zh" | "en" };

export function PosCardPaymentBenefitsReview({ locale }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<PosCardPaymentReviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const zh = locale === "zh";

  const reload = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetchPosCardPaymentBenefitsReview();
      setItems(response.items);
    } catch {
      // A failed read must not imply that there are no outstanding checkouts.
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

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
                ? "仅供人工核查：超过原准备时限不代表支付失败，也不代表积分、余额或优惠券已释放。禁止因此重新刷卡或手动解除权益占用。"
                : "Review only: passing the original preparation deadline does not mean payment failed or benefits were released. Do not charge again or release benefits based on this list."}
            </p>
            <button
              type="button"
              onClick={() => void reload()}
              disabled={loading}
              className="min-h-10 rounded-lg border border-slate-500 px-4 py-2 text-xs font-semibold text-slate-100 disabled:opacity-50"
            >
              {loading
                ? (zh ? "查询中…" : "Loading…")
                : (zh ? "刷新待核查列表" : "Refresh review queue")}
            </button>
            {error ? (
              <p role="alert" className="text-sm text-rose-200">
                {zh
                  ? "无法读取状态，请稍后重试；不能据此认定无待核查交易。"
                  : "Status unavailable. Retry later; do not assume the queue is empty."}
              </p>
            ) : !loading && items.length === 0 ? (
              <p className="text-xs text-slate-300">
                {zh ? "当前未发现符合筛选条件的记录。" : "No matching checkout records found."}
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
                          ? (zh ? "确认失败／取消 · 权益释放待完成" : "Final failure/cancel · benefit release pending")
                          : (zh ? "超过原准备时限 · 付款需核查" : "Past preparation deadline · payment review")}
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
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-slate-400">
              {zh
                ? "只读、按当前门店筛选、最多显示 25 条。金额是下单时冻结的分配快照，不是权益账本实时状态。"
                : "Read-only, store-scoped, max 25 records. Amounts are checkout snapshots, not live benefit ledger balances."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
