// apps/web/src/app/[locale]/store/display/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Locale } from "@/lib/order/shared";
import {
  POS_DISPLAY_STORAGE_KEY,
  POS_DISPLAY_CHANNEL,
  type PosDisplaySnapshot,
} from "@/lib/pos-display";

function formatMoney(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100;
  return `$${value.toFixed(2)}`;
}

export default function StoreDisplayPage() {
  // locale 以后做语音之类可能会用，这里主要是双语展示
  const params = useParams();
  const _locale = (params?.locale as Locale) ?? "zh";
  void _locale;

  const [snapshot, setSnapshot] = useState<PosDisplaySnapshot | null>(null);

  useEffect(() => {
    const readSnapshot = () => {
      if (typeof window === "undefined") return;
      try {
        const raw = window.localStorage.getItem(POS_DISPLAY_STORAGE_KEY);
        if (!raw) {
          setSnapshot(null);
          return;
        }
        const parsed = JSON.parse(raw) as PosDisplaySnapshot;
        if (!parsed || !Array.isArray(parsed.items)) {
          setSnapshot(null);
          return;
        }
        setSnapshot(parsed);
      } catch (err) {
        console.warn("Failed to read POS display snapshot:", err);
        setSnapshot(null);
      }
    };

    readSnapshot();

    // 1) storage：跨 tab/跨窗口写 localStorage 才会触发
    const handleStorage = (event: StorageEvent) => {
      if (event.key === POS_DISPLAY_STORAGE_KEY) {
        readSnapshot();
      }
    };
    window.addEventListener("storage", handleStorage);

    // 2) BroadcastChannel：更实时；同源多窗口/多 tab 都能收到
    let channel: BroadcastChannel | null = null;
    try {
      if ("BroadcastChannel" in window) {
        channel = new BroadcastChannel(POS_DISPLAY_CHANNEL);
        channel.onmessage = (evt: MessageEvent) => {
          const data = evt.data as
            | { type: "snapshot"; snapshot: PosDisplaySnapshot }
            | { type: "clear" }
            | null;

          if (!data || typeof data !== "object") return;

          if (data.type === "clear") {
            setSnapshot(null);
            return;
          }
          if (data.type === "snapshot" && data.snapshot) {
            setSnapshot(data.snapshot);
          }
        };
      }
    } catch {
      channel = null;
    }

    // 3) 最后兜底：轻量轮询（防止某些环境 event 丢失）
    const pollId = window.setInterval(readSnapshot, 800);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.clearInterval(pollId);
      try {
        channel?.close();
      } catch {
        // ignore
      }
    };
  }, []);

  const items = snapshot?.items ?? [];
  const subtotalCents = snapshot?.subtotalCents ?? 0;
  const taxCents = snapshot?.taxCents ?? 0;
  const totalCents = snapshot?.totalCents ?? 0;
  const fallbackDiscountCents = Math.max(0, subtotalCents + taxCents - totalCents);

  const discountCents = snapshot?.discountCents ?? fallbackDiscountCents;

  return (
    <main className="min-h-screen bg-slate-900 text-slate-50 flex flex-col items-center">
      <header className="w-full max-w-6xl px-8 py-6">
        <h1 className="text-3xl font-semibold tracking-wide">
          顾客显示屏 · Customer Display
        </h1>
        <p className="mt-2 text-xl text-slate-300">
          请确认收银员为您选定的菜品与金额。Please review the items and totals
          selected by the cashier.
        </p>
      </header>

      <section className="w-full max-w-6xl flex-1 flex flex-col px-8 pb-8">
        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <h2 className="text-5xl font-semibold mb-4">欢迎光临 · Welcome</h2>
            <p className="text-2xl text-slate-300 max-w-3xl">
              点餐过程中，收银员为您选择的菜品、数量和金额会实时显示在此屏幕上。
              While the cashier is helping you, your items and totals will
              appear here in real time.
            </p>
          </div>
        ) : (
          <>
            {/* 上方：菜品列表 */}
            <div className="flex-1 rounded-3xl bg-slate-800/80 border border-slate-700 overflow-hidden">
              <div className="grid grid-cols-4 text-2xl font-semibold px-6 py-4 border-b border-slate-700">
                <div className="text-left">菜品 Item</div>
                <div className="text-center">数量 Qty</div>
                <div className="text-right">单价 Price</div>
                <div className="text-right">小计 Subtotal</div>
              </div>
              <div className="max-h-[60vh] overflow-auto">
                {items.map((item) => (
                  <div
                    key={
                      item.lineId ??
                      `${item.stableId}-${item.unitPriceCents}-${item.quantity}`
                    }
                    className="grid grid-cols-4 px-6 py-4 text-3xl border-b border-slate-800 last:border-b-0"
                  >
                    <div className="pr-4">
                      <div>{item.nameZh}</div>
                      <div>{item.nameEn}</div>
                    </div>
                    <div className="text-center font-semibold">
                      {item.quantity}
                    </div>
                    <div className="text-right">
                      {formatMoney(item.unitPriceCents)}
                    </div>
                    <div className="text-right font-bold">
                      {formatMoney(item.lineTotalCents)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 下方：金额汇总 */}
            <div className="mt-4 rounded-3xl bg-slate-900/80 border border-slate-700 px-6 py-4 text-3xl">
              <div className="flex justify-between">
                <span>小计 Subtotal</span>
                <span>{formatMoney(subtotalCents)}</span>
              </div>
              {discountCents > 0 && (
                <div className="flex justify-between mt-2 text-emerald-300">
                  <span>折扣 Discount</span>
                  <span>-{formatMoney(discountCents)}</span>
                </div>
              )}
              <div className="flex justify-between mt-2">
                <span>税费 Tax</span>
                <span>{formatMoney(taxCents)}</span>
              </div>
              <div className="flex justify-between mt-4 text-4xl font-bold">
                <span>合计 Total</span>
                <span>{formatMoney(totalCents)}</span>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
