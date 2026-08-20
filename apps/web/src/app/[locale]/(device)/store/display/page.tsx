// apps/web/src/app/[locale]/(device)/store/display/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { Locale } from "@/lib/i18n/locales";
import {
  POS_DISPLAY_CHANNEL,
  POS_DISPLAY_STORAGE_KEY,
  type PosDisplayItem,
  type PosDisplaySnapshot,
} from "@/lib/pos-display";

function formatMoney(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100;
  return `$${value.toFixed(2)}`;
}

type Density = "relaxed" | "compact" | "two" | "dense" | "emergency";

function densityForItems(items: PosDisplayItem[]): Density {
  const modifierCount = items.reduce(
    (sum, item) => sum + (item.optionLines?.length ?? 0),
    0,
  );
  const weightedLines = items.length + modifierCount * 0.45;

  if (items.length <= 5 && weightedLines <= 7.5) return "relaxed";
  if (items.length <= 8 && weightedLines <= 11) return "compact";
  if (items.length <= 14 && weightedLines <= 19) return "two";
  if (items.length <= 20 && weightedLines <= 29) return "dense";
  return "emergency";
}

function columnsForDensity(density: Density): number {
  switch (density) {
    case "relaxed":
    case "compact":
      return 1;
    case "two":
    case "dense":
      return 2;
    case "emergency":
      return 3;
  }
}

function densityClasses(density: Density) {
  switch (density) {
    case "relaxed":
      return {
        card: "px-5 py-4",
        name: "text-2xl",
        secondary: "mt-1 text-base",
        modifier: "mt-2 text-sm",
        price: "mt-3 text-lg",
      };
    case "compact":
      return {
        card: "px-4 py-3",
        name: "text-xl",
        secondary: "mt-0.5 text-sm",
        modifier: "mt-1.5 text-xs",
        price: "mt-2 text-base",
      };
    case "two":
      return {
        card: "px-4 py-3",
        name: "text-lg",
        secondary: "mt-0.5 text-xs",
        modifier: "mt-1 text-xs",
        price: "mt-2 text-base",
      };
    case "dense":
      return {
        card: "px-3 py-2.5",
        name: "text-base",
        secondary: "hidden",
        modifier: "mt-1 text-[11px]",
        price: "mt-1.5 text-sm",
      };
    case "emergency":
      return {
        card: "px-2.5 py-2",
        name: "text-sm",
        secondary: "hidden",
        modifier: "mt-1 text-[10px]",
        price: "mt-1 text-xs",
      };
  }
}

function itemPrimaryName(item: PosDisplayItem, locale: Locale): string {
  return locale === "zh" ? item.nameZh || item.nameEn : item.nameEn || item.nameZh;
}

function itemSecondaryName(item: PosDisplayItem, locale: Locale): string {
  return locale === "zh" ? item.nameEn : item.nameZh;
}

function optionPrimaryLabel(
  option: NonNullable<PosDisplayItem["optionLines"]>[number],
  locale: Locale,
): string {
  if (locale === "zh") return option.labelZh ?? option.label;
  return option.labelEn ?? option.label;
}

function optionSecondaryLabel(
  option: NonNullable<PosDisplayItem["optionLines"]>[number],
  locale: Locale,
): string | null {
  const value = locale === "zh" ? option.labelEn : option.labelZh;
  const primary = optionPrimaryLabel(option, locale);
  return value && value !== primary ? value : null;
}

export default function StoreDisplayPage() {
  const params = useParams<{ locale?: string }>();
  const locale = (params?.locale === "en" ? "en" : "zh") as Locale;
  const isZh = locale === "zh";
  const [snapshot, setSnapshot] = useState<PosDisplaySnapshot | null>(null);

  useEffect(() => {
    const readSnapshot = () => {
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
      } catch (error) {
        console.warn("Failed to read POS display snapshot:", error);
        setSnapshot(null);
      }
    };

    readSnapshot();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === POS_DISPLAY_STORAGE_KEY) readSnapshot();
    };
    window.addEventListener("storage", handleStorage);

    let channel: BroadcastChannel | null = null;
    try {
      if ("BroadcastChannel" in window) {
        channel = new BroadcastChannel(POS_DISPLAY_CHANNEL);
        channel.onmessage = (event: MessageEvent) => {
          const data = event.data as
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
  const density = useMemo(() => densityForItems(items), [items]);
  const columns = columnsForDensity(density);
  const rows = Math.max(1, Math.ceil(items.length / columns));
  const classes = densityClasses(density);
  const showBilingualModifiers = density === "relaxed" || density === "two";

  const itemsSubtotalCents = useMemo(
    () => items.reduce((sum, item) => sum + (item.lineTotalCents ?? 0), 0),
    [items],
  );
  const discountCents = Math.max(0, snapshot?.discountCents ?? 0);
  const taxCents = snapshot?.taxCents ?? 0;
  const totalCents = snapshot?.totalCents ?? 0;
  const otherCreditsCents = Math.max(
    0,
    itemsSubtotalCents - discountCents + taxCents - totalCents,
  );
  const loyalty = snapshot?.loyalty;

  if (items.length === 0) {
    return (
      <main className="h-dvh w-screen overflow-hidden bg-slate-950 text-slate-50">
        <div className="flex h-full flex-col">
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 px-6">
            <div className="flex flex-col leading-tight">
              <div className="text-xl font-semibold tracking-wide">
                三秦肉夹馍 / SanQ Roujiamo
              </div>
              <div className="mt-0.5 text-xs text-slate-400">
                顾客确认屏 / Customer Display
              </div>
            </div>
            <div className="text-sm text-slate-400">
              实时同步 POS / Live from POS
            </div>
          </header>
          <div className="flex flex-1 flex-col items-center justify-center px-12 text-center">
            <h1 className="text-5xl font-bold">欢迎光临 / Welcome</h1>
            <div className="mt-4 max-w-4xl text-2xl leading-relaxed text-slate-300">
              <p>点餐过程中，菜品、选项、数量和金额会实时显示在这里，请您核对。</p>
              <p className="mt-2 text-xl text-slate-400">
                Your items, options, quantities, and totals will appear here in real time while we take your order. Please review them carefully.
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="h-dvh w-screen overflow-hidden bg-slate-950 text-slate-50">
      <div className="grid h-full grid-rows-[56px_minmax(0,1fr)]">
        <header className="flex items-center justify-between border-b border-slate-800 px-5">
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl font-semibold">
              {isZh ? "请确认您的订单" : "Please review your order"}
            </h1>
            <span className="text-sm text-slate-400">
              {isZh ? "Please review your order" : "请确认您的订单"}
            </span>
          </div>
          <div className="text-xs text-slate-500">
            {isZh ? "菜品 · 选项 · 数量 · 金额" : "Items · Modifiers · Qty · Total"}
          </div>
        </header>

        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_clamp(300px,24vw,340px)] gap-3 p-3">
          <section className="min-h-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 p-2">
            <div
              className="grid h-full min-h-0 gap-2"
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
              }}
            >
              {items.map((item) => {
                const secondaryName = itemSecondaryName(item, locale);
                const optionLines = item.optionLines ?? [];
                return (
                  <article
                    key={item.lineId ?? `${item.stableId}-${item.unitPriceCents}`}
                    className={`flex min-h-0 flex-col justify-between overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70 ${classes.card}`}
                  >
                    <div className="min-h-0">
                      <div className={`${classes.name} font-semibold leading-tight`}>
                        {itemPrimaryName(item, locale)}
                      </div>
                      {secondaryName ? (
                        <div className={`${classes.secondary} leading-tight text-slate-400`}>
                          {secondaryName}
                        </div>
                      ) : null}

                      {optionLines.length > 0 ? (
                        <div className={`${classes.modifier} flex flex-wrap gap-x-1.5 gap-y-0.5 leading-tight text-amber-200`}>
                          {optionLines.map((option, index) => {
                            const secondary = optionSecondaryLabel(option, locale);
                            return (
                              <span key={`${item.lineId ?? item.stableId}-option-${index}`}>
                                {index > 0 ? <span className="mr-1.5 text-slate-600">·</span> : null}
                                {optionPrimaryLabel(option, locale)}
                                {showBilingualModifiers && secondary ? (
                                  <span className="ml-1 text-slate-500">{secondary}</span>
                                ) : null}
                                {option.priceCents !== 0 ? (
                                  <span className="ml-1 text-slate-300">
                                    {option.priceCents > 0 ? "+" : "-"}
                                    {formatMoney(Math.abs(option.priceCents))}
                                  </span>
                                ) : null}
                              </span>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>

                    <div className={`${classes.price} flex items-end justify-between gap-3 border-t border-slate-800 pt-2 tabular-nums`}>
                      <div className="font-medium text-slate-300">
                        {formatMoney(item.unitPriceCents)}
                        <span className="mx-1.5 text-slate-500">×</span>
                        <span className="font-bold text-slate-50">{item.quantity}</span>
                      </div>
                      <div className="font-bold text-slate-50">
                        {formatMoney(item.lineTotalCents)}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="flex min-h-0 flex-col rounded-2xl border border-slate-800 bg-slate-900 px-5 py-5">
            <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
              {isZh ? "本单金额" : "Order total"}
            </div>

            <div className="mt-6 space-y-3 text-lg tabular-nums">
              <div className="flex justify-between gap-4">
                <span className="text-slate-300">{isZh ? "小计 Subtotal" : "Subtotal 小计"}</span>
                <span>{formatMoney(itemsSubtotalCents)}</span>
              </div>
              {discountCents > 0 ? (
                <div className="flex justify-between gap-4 text-emerald-300">
                  <span>{isZh ? "优惠 Discount" : "Discount 优惠"}</span>
                  <span>-{formatMoney(discountCents)}</span>
                </div>
              ) : null}
              {otherCreditsCents > 0 ? (
                <div className="flex justify-between gap-4 text-sky-300">
                  <span>{isZh ? "其他抵扣 Credits" : "Credits 其他抵扣"}</span>
                  <span>-{formatMoney(otherCreditsCents)}</span>
                </div>
              ) : null}
              <div className="flex justify-between gap-4">
                <span className="text-slate-300">{isZh ? "税费 Tax" : "Tax 税费"}</span>
                <span>{formatMoney(taxCents)}</span>
              </div>
            </div>

            <div className="mt-6 border-t border-slate-700 pt-5">
              <div className="text-base font-semibold text-slate-300">
                {isZh ? "合计 TOTAL" : "TOTAL 合计"}
              </div>
              <div className="mt-1 text-right text-5xl font-extrabold tracking-tight tabular-nums text-amber-300">
                {formatMoney(totalCents)}
              </div>
            </div>

            {loyalty ? (
              <div className="mt-auto rounded-xl border border-emerald-900/70 bg-emerald-950/30 px-3 py-3 text-sm text-emerald-200">
                {typeof loyalty.pointsRedeemed === "number" && loyalty.pointsRedeemed > 0 ? (
                  <div className="flex justify-between gap-3">
                    <span>{isZh ? "使用积分" : "Points used"}</span>
                    <span className="font-semibold tabular-nums">{loyalty.pointsRedeemed.toFixed(2)}</span>
                  </div>
                ) : null}
                {typeof loyalty.pointsEarned === "number" && loyalty.pointsEarned > 0 ? (
                  <div className="mt-1 flex justify-between gap-3">
                    <span>{isZh ? "本单新增积分" : "Points earned"}</span>
                    <span className="font-semibold tabular-nums">+{loyalty.pointsEarned.toFixed(2)}</span>
                  </div>
                ) : null}
                {typeof loyalty.pointsBalanceAfter === "number" ? (
                  <div className="mt-1 flex justify-between gap-3 text-slate-300">
                    <span>{isZh ? "结算后积分" : "Balance after"}</span>
                    <span className="tabular-nums">{loyalty.pointsBalanceAfter.toFixed(2)}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  );
}
